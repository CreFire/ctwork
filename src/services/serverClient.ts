/**
 * ============================================================
 * 正式后端客户端 — 对接 server/(dueGame 风格 Go 网关)v0.1 HTTP 协议
 * ============================================================
 * - VITE_API_BASE:后端地址(默认空 = 同源;dev 由 vite 代理 /api)
 * - 会话与 mockServer 同形:localStorage["ark_session_v1"] = {token, uid}
 * - 协议见 docs/ARCHITECTURE.md §2.3
 * ============================================================
 */
import { ApiError } from "./mockServer";

const BASE: string = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").trim();
const LS_SESSION = "ark_session_v1";

export interface LeagueRow {
  uid: string;
  account: string;
  runScore: number;
  runId: number;
  escaped: boolean;
  ts: number;
}

export interface LeagueTopResult {
  list: LeagueRow[];
  me: { rank: number; runScore: number } | null;
  serverTime: number;
}

function readSession(): { token: string; uid: string } | null {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    return s && s.token && s.uid ? s : null;
  } catch {
    return null;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const sess = readSession();
  if (sess?.token) headers.set("Authorization", `Bearer ${sess.token}`);
  let resp: Response;
  try {
    resp = await fetch(BASE + path, { ...init, headers });
  } catch {
    throw new ApiError(0, "无法连接方舟网络(dueGame),请确认服务器已启动");
  }
  const text = await resp.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应 */
  }
  if (!resp.ok) {
    const msg = (body as { error?: string } | null)?.error || `请求失败(HTTP ${resp.status})`;
    throw new ApiError(resp.status, msg);
  }
  return body as T;
}

export const server = {
  /** 登录即注册;成功后会话写入 localStorage(与 mock 同形) */
  async loginOrRegister(account: string, password: string) {
    const r = await req<{ token: string; uid: string; account: string; isNew: boolean; createdAt: number }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ account: account.trim(), password }) },
    );
    localStorage.setItem(LS_SESSION, JSON.stringify({ token: r.token, uid: r.uid }));
    return r;
  },

  resolveSession(): { uid: string } | null {
    return readSession();
  },

  async profile(_uid: string): Promise<{ uid: string; account: string; createdAt: number } | null> {
    try {
      return await req<{ uid: string; account: string; createdAt: number }>("/api/v1/player/profile");
    } catch (e) {
      if (e instanceof ApiError && (e.code === 401 || e.code === 403)) return null;
      throw e;
    }
  },

  async loadSave(_uid: string): Promise<string | null> {
    const r = await req<{ save: unknown | null }>("/api/v1/player/save");
    return r.save ? JSON.stringify(r.save) : null;
  },

  async writeSave(_uid: string, json: string): Promise<void> {
    await req<{ ok: boolean; warnings?: string[] }>("/api/v1/player/save", { method: "POST", body: json });
  },

  async wipeSave(_uid: string): Promise<void> {
    await req<{ ok: boolean }>("/api/v1/player/save", { method: "DELETE" });
  },

  logout() {
    localStorage.removeItem(LS_SESSION);
  },

  /** 产能榜 TopN + 我的名次(真实后端;失败由调用方回退模拟榜) */
  async leagueTop(n = 9): Promise<LeagueTopResult> {
    return req<LeagueTopResult>(`/api/v1/league/top?n=${n}`);
  },
};
