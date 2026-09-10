/**
 * API 客户端 - 支持 Mock 与真实后端的无缝切换
 * 通过 VITE_API_URL 环境变量控制：
 * - 未设置或为空：使用 mockServer (localStorage)
 * - 设置为 http://localhost:3001：使用真实排行榜后端
 */

import { server as mockServer } from "./mockServer";

const API_URL = (import.meta as any).env?.VITE_API_URL || "";
const USE_REAL_API = !!API_URL;

console.log(`[API] Mode: ${USE_REAL_API ? `REAL (${API_URL})` : "MOCK (localStorage)"}`);

interface ApiOptions {
  method?: string;
  body?: any;
  token?: string;
  params?: Record<string, string>;
}

async function apiFetch(path: string, opts: ApiOptions = {}) {
  const url = new URL(`${API_URL}${path}`);
  
  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (opts.token) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  } else {
    // 尝试从 localStorage 获取 token (兼容 mock)
    try {
      const sess = JSON.parse(localStorage.getItem("ark_session_v1") || "null");
      if (sess?.token) {
        headers["Authorization"] = `Bearer ${sess.token}`;
      }
    } catch {}
  }

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.message || `HTTP ${res.status}`);
  }

  return data;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// 统一接口，兼容 mock 与 real
export const api = {
  // 认证
  async loginOrRegister(account: string, password: string) {
    if (USE_REAL_API) {
      const data = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: { account, password },
      });
      // 保存 session 以便后续请求
      localStorage.setItem("ark_session_v1", JSON.stringify({ token: data.token, uid: data.uid }));
      return {
        token: data.token,
        uid: data.uid,
        account: data.account,
        isNew: data.is_new ?? data.isNew ?? false,
        createdAt: data.created_at ?? data.createdAt,
      };
    } else {
      return mockServer.loginOrRegister(account, password);
    }
  },

  resolveSession() {
    return mockServer.resolveSession();
  },

  async profile(uid: string) {
    if (USE_REAL_API) {
      try {
        const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
        const data = await apiFetch("/api/v1/player/profile", { token });
        return data;
      } catch {
        // 回退到 mock 的 profile
        return mockServer.profile(uid);
      }
    } else {
      return mockServer.profile(uid);
    }
  },

  async loadSave(uid: string) {
    if (USE_REAL_API) {
      try {
        const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
        const data = await apiFetch("/api/v1/player/save", { token });
        return data.payload || null;
      } catch (e) {
        if ((e as ApiError).code === 404) return null;
        // 回退到 mock
        console.warn("[API] loadSave real failed, fallback to mock:", e);
        return mockServer.loadSave(uid);
      }
    } else {
      return mockServer.loadSave(uid);
    }
  },

  async writeSave(uid: string, json: string) {
    if (USE_REAL_API) {
      try {
        const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
        await apiFetch("/api/v1/player/save", {
          method: "POST",
          token,
          body: { payload: json, version: 1 },
        });
      } catch (e) {
        console.warn("[API] writeSave real failed, fallback to mock:", e);
        // 仍然写入 mock 作为备份
        await mockServer.writeSave(uid, json);
      }
    } else {
      return mockServer.writeSave(uid, json);
    }
  },

  async wipeSave(uid: string) {
    if (USE_REAL_API) {
      try {
        const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
        await apiFetch("/api/v1/player/save", { method: "DELETE", token });
      } catch {}
    }
    return mockServer.wipeSave(uid);
  },

  logout() {
    mockServer.logout();
    // 真实后端可调用登出接口
    if (USE_REAL_API) {
      localStorage.removeItem("ark_session_v1");
    }
  },

  // 排行榜 (始终尝试真实后端，失败回退到 mock)
  league: {
    async getTop(params: { uid?: string; limit?: number; sortBy?: string; route?: string } = {}) {
      if (USE_REAL_API) {
        try {
          const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
          const data = await apiFetch("/api/v1/league/top", {
            token,
            params: {
              uid: params.uid || "",
              limit: String(params.limit || 100),
              sortBy: params.sortBy || "run_score",
              route: params.route || "",
            },
          });
          return data;
        } catch (e) {
          console.warn("[API] league.getTop real failed, using mock:", e);
          throw e;
        }
      } else {
        // Mock 模式下，返回空，由前端模拟
        throw new Error("Mock mode - use local simulation");
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
      if (USE_REAL_API) {
        try {
          const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
          const data = await apiFetch("/api/v1/league/submit", {
            method: "POST",
            token,
            body: entry,
          });
          return data;
        } catch (e) {
          console.warn("[API] league.submitScore failed:", e);
          throw e;
        }
      } else {
        // Mock 模式：存入 localStorage 模拟排行榜
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
    },

    async getStats() {
      if (USE_REAL_API) {
        return apiFetch("/api/v1/league/stats");
      } else {
        return { leaderboard: { totalPlayers: 0 }, store: { type: "mock" } };
      }
    },

    async getSeason(uid: string, limit = 100, days = 7) {
      if (USE_REAL_API) {
        const token = JSON.parse(localStorage.getItem("ark_session_v1") || "{}")?.token;
        return apiFetch("/api/v1/league/season", {
          token,
          params: { uid, limit: String(limit), days: String(days) },
        });
      } else {
        throw new Error("Mock mode");
      }
    },
  },
};

export const isRealApi = USE_REAL_API;
export const apiUrl = API_URL;
