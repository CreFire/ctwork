/**
 * API 客户端 - 支持 Mock / Node 榜单后端 / Go dueGame 后端 无缝切换
 * 环境变量：
 * - VITE_USE_MOCK=1 → 强制 mock (localStorage)
 * - VITE_API_URL / VITE_API_BASE → 真实后端地址 (空 = mock, 同源由 vite proxy)
 *   兼容两种命名：VITE_API_URL (Node 榜单分支) / VITE_API_BASE (Go 分支)
 */

import { server as mockServer, ApiError } from "./mockServer";

const ENV = (import.meta as any).env || {};
const RAW_BASE: string = (ENV.VITE_API_URL || ENV.VITE_API_BASE || "").trim();
const USE_MOCK_FLAG = ENV.VITE_USE_MOCK === "1";
const USE_REAL_API = !USE_MOCK_FLAG && !!RAW_BASE;
const API_URL = RAW_BASE; // 若为空，同源请求 (vite proxy -> Go)

console.log(`[API] Mode: ${USE_MOCK_FLAG ? "MOCK(forced)" : USE_REAL_API ? `REAL (${API_URL || "same-origin proxy"})` : "MOCK (localStorage)"}`);

const LS_SESSION = "ark_session_v1";

function readSession(): { token: string; uid: string } | null {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    return s && s.token && s.uid ? s : null;
  } catch {
    return null;
  }
}

interface ApiOptions {
  method?: string;
  body?: any;
  token?: string;
  params?: Record<string, string | number>;
}

async function apiFetch(path: string, opts: ApiOptions = {}) {
  const url = new URL(path.startsWith("http") ? path : `${API_URL}${path}`, window.location.origin);

  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = opts.token || readSession()?.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "无法连接方舟网络，请确认服务器已启动");
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export { ApiError };

export const api = {
  // ---------- 认证 ----------
  async loginOrRegister(account: string, password: string) {
    if (!USE_REAL_API) {
      return mockServer.loginOrRegister(account, password);
    }
    try {
      // Go + Node 都支持 /api/v1/auth/login
      const data = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: { account: account.trim(), password },
      });
      localStorage.setItem(LS_SESSION, JSON.stringify({ token: data.token, uid: data.uid }));
      return {
        token: data.token,
        uid: data.uid,
        account: data.account,
        isNew: data.isNew ?? data.is_new ?? false,
        createdAt: data.createdAt ?? data.created_at,
      };
    } catch (e) {
      console.warn("[API] login real failed, fallback to mock:", e);
      // 网络不通时回退到 mock，保证离线可玩
      if ((e as ApiError).code === 0) return mockServer.loginOrRegister(account, password);
      throw e;
    }
  },

  resolveSession() {
    return readSession() || mockServer.resolveSession();
  },

  async profile(uid: string) {
    if (!USE_REAL_API) return mockServer.profile(uid);
    try {
      // Go: /api/v1/player/profile , 旧版可能 /api/v1/account/me
      try {
        return await apiFetch("/api/v1/player/profile");
      } catch {
        return await apiFetch("/api/v1/account/me");
      }
    } catch (e) {
      if ((e as ApiError).code === 401 || (e as ApiError).code === 403) return null;
      console.warn("[API] profile real failed, fallback to mock:", e);
      return mockServer.profile(uid);
    }
  },

  async loadSave(uid: string) {
    if (!USE_REAL_API) return mockServer.loadSave(uid);
    try {
      // Go: GET /api/v1/player/save → {save: object|null}
      // Node: GET /api/v1/player/save → {payload}
      const data = await apiFetch("/api/v1/player/save");
      if (data.save !== undefined) {
        return data.save ? JSON.stringify(data.save) : null;
      }
      if (data.payload !== undefined) {
        return data.payload || null;
      }
      return data ? JSON.stringify(data) : null;
    } catch (e) {
      if ((e as ApiError).code === 404) return null;
      console.warn("[API] loadSave real failed, fallback to mock:", e);
      return mockServer.loadSave(uid);
    }
  },

  async writeSave(uid: string, json: string) {
    if (!USE_REAL_API) return mockServer.writeSave(uid, json);
    try {
      // Go 期望直接存对象，Node 期望 {payload, version}
      let payload: any;
      try {
        payload = JSON.parse(json);
      } catch {
        payload = json;
      }
      // 先尝试 Go 协议：直接 POST 存档对象
      try {
        await apiFetch("/api/v1/player/save", { method: "POST", body: payload });
      } catch {
        // 回退 Node 协议
        await apiFetch("/api/v1/player/save", {
          method: "POST",
          body: { payload: json, version: 1 },
        });
      }
    } catch (e) {
      console.warn("[API] writeSave real failed, fallback to mock:", e);
      await mockServer.writeSave(uid, json);
    }
  },

  async wipeSave(uid: string) {
    if (USE_REAL_API) {
      try {
        await apiFetch("/api/v1/player/save", { method: "DELETE" });
      } catch {}
    }
    return mockServer.wipeSave(uid);
  },

  logout() {
    mockServer.logout();
    localStorage.removeItem(LS_SESSION);
  },

  // ---------- 排行榜 ----------
  league: {
    async getTop(params: { uid?: string; limit?: number; sortBy?: string; route?: string } = {}) {
      if (!USE_REAL_API) throw new Error("Mock mode - use local simulation");
      // Go: /api/v1/league/top?n=9&uid=&route=&sortBy=
      // Node: /api/v1/league/top?uid=&limit=&sortBy=&route=
      try {
        const data = await apiFetch("/api/v1/league/top", {
          params: {
            uid: params.uid || "",
            limit: params.limit || 100,
            n: params.limit || 100,
            sortBy: params.sortBy || "run_score",
            route: params.route || "",
          },
        });
        // 兼容 Go 返回 {list, me} 与 Node 返回 {entries, myRank, myEntry, ...}
        if (data.list) return data;
        if (data.entries) {
          return {
            list: data.entries.map((e: any) => ({
              uid: e.uid,
              account: e.account,
              runScore: e.run_score ?? e.runScore,
              runId: e.run_id ?? e.runId,
              escaped: e.escaped,
              ts: e.updated_at ? Date.parse(e.updated_at) : Date.now(),
            })),
            me: data.myRank ? { rank: data.myRank, runScore: data.myEntry?.run_score ?? 0 } : null,
            serverTime: Date.now(),
            raw: data,
          };
        }
        return data;
      } catch (e) {
        console.warn("[API] league.getTop failed:", e);
        throw e;
      }
    },

    async submitScore(entry: {
      uid: string;
      account?: string;
      run_score: number;
      escaped: boolean;
      run_id: number;
      route?: string | null;
      cores?: number;
      totalEnergy?: number;
      bestRemainSec?: number;
      totalClicks?: number;
      runs?: number;
      escapes?: number;
    }) {
      if (!USE_REAL_API) {
        const key = "ark_mock_league";
        try {
          const existing = JSON.parse(localStorage.getItem(key) || "{}");
          const best = existing[entry.uid];
          if (!best || entry.run_score > best.run_score) {
            existing[entry.uid] = { ...entry, ts: Date.now() };
            localStorage.setItem(key, JSON.stringify(existing));
          }
          return { ok: true, entry: existing[entry.uid] };
        } catch {
          return { ok: true };
        }
      }
      try {
        // Go: POST /api/v1/league/submit? Node 同路径
        const data = await apiFetch("/api/v1/league/submit", {
          method: "POST",
          body: entry,
        });
        return data;
      } catch (e) {
        console.warn("[API] league.submitScore failed:", e);
        // 不抛异常，避免影响游戏结算
        return { ok: false, error: String(e) };
      }
    },

    async getStats() {
      if (!USE_REAL_API) return { leaderboard: { totalPlayers: 0 }, store: { type: "mock" } };
      try {
        return await apiFetch("/api/v1/league/stats");
      } catch {
        return { leaderboard: { totalPlayers: 0 }, store: { type: "real" } };
      }
    },

    async getSeason(uid: string, limit = 100, days = 7) {
      if (!USE_REAL_API) throw new Error("Mock mode");
      return apiFetch("/api/v1/league/season", {
        params: { uid, limit, days },
      });
    },
  },

  // 兼容旧 serverClient.leagueTop(n)
  async leagueTop(n = 9) {
    if (!USE_REAL_API) throw new Error("Mock mode");
    return (api.league as any).getTop({ limit: n });
  },
};

export const isRealApi = USE_REAL_API;
export const apiUrl = API_URL;
export const isMockForced = USE_MOCK_FLAG;
