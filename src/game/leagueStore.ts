/**
 * 排行榜状态管理 - Zustand
 * 负责排行榜数据的获取、缓存、刷新、提交
 */
import { create } from "zustand";
import type { SaveState } from "./engine";
import { fetchLeaderboard, fetchFullLeaderboard, submitToLeaderboard, type LeaderboardEntry } from "@/services/leaderboardService";
import { isRealApi } from "@/services/api";

export type SortBy = "run_score" | "totalEnergy" | "cores" | "bestRemainSec";
export type RouteFilter = "all" | "machine" | "swarm" | "psionic";

interface LeagueStore {
  // 数据
  top: LeaderboardEntry[];
  fullTop: LeaderboardEntry[]; // 完整榜单 (100条)
  myRank: LeaderboardEntry | null;
  myRankNumber: number | null;
  total: number;
  source: "real" | "mock";
  
  // 状态
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  
  // 筛选
  sortBy: SortBy;
  routeFilter: RouteFilter;
  
  // 统计
  stats: any | null;

  // 操作
  fetch: (save: SaveState | null, uid: string, account: string) => Promise<void>;
  fetchFull: (uid: string) => Promise<void>;
  submit: (save: SaveState, account: string) => Promise<{ ok: boolean; rank?: number }>;
  setSortBy: (s: SortBy) => void;
  setRouteFilter: (r: RouteFilter) => void;
  refresh: (save: SaveState | null, uid: string, account: string) => Promise<void>;
  clearError: () => void;
}

export const useLeague = create<LeagueStore>((set, get) => ({
  top: [],
  fullTop: [],
  myRank: null,
  myRankNumber: null,
  total: 0,
  source: "mock",
  loading: false,
  error: null,
  lastFetchedAt: null,
  sortBy: "run_score",
  routeFilter: "all",
  stats: null,

  async fetch(save, uid, account) {
    if (!uid) return;
    
    set({ loading: true, error: null });
    
    try {
      const result = await fetchLeaderboard(save, uid, account, {
        limit: 8,
        sortBy: get().sortBy,
        route: get().routeFilter === "all" ? undefined : get().routeFilter,
      });
      
      set({
        top: result.top,
        myRank: result.myRank,
        myRankNumber: result.myRankNumber,
        total: result.total,
        source: result.source,
        lastFetchedAt: Date.now(),
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  async fetchFull(uid) {
    if (!uid) return;
    
    set({ loading: true, error: null });
    
    try {
      const result = await fetchFullLeaderboard(uid, {
        limit: 100,
        sortBy: get().sortBy,
        route: get().routeFilter === "all" ? undefined : get().routeFilter,
      });
      
      set({
        fullTop: result.top,
        myRank: result.myRank,
        total: result.total,
        source: result.source as any,
        lastFetchedAt: Date.now(),
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  async submit(save, account) {
    set({ loading: true, error: null });
    
    try {
      const result = await submitToLeaderboard(save, account);
      
      if (result.ok) {
        // 提交成功后刷新榜单
        await get().fetch(save, save.uid, account);
        set({ loading: false });
        return result;
      } else {
        set({ loading: false, error: result.reason || "提交失败" });
        return result;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
      return { ok: false, reason: msg };
    }
  },

  setSortBy(sortBy) {
    set({ sortBy });
  },

  setRouteFilter(routeFilter) {
    set({ routeFilter });
  },

  async refresh(save, uid, account) {
    // 强制刷新，忽略缓存
    return get().fetch(save, uid, account);
  },

  clearError() {
    set({ error: null });
  },
}));

// 自动刷新间隔 (30秒)
let autoRefreshTimer: number | null = null;

export function startLeagueAutoRefresh(getSave: () => { save: SaveState | null; uid: string; account: string } | null) {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  
  autoRefreshTimer = window.setInterval(() => {
    const ctx = getSave();
    if (ctx?.save && ctx?.uid) {
      void useLeague.getState().fetch(ctx.save, ctx.uid, ctx.account);
    }
  }, 30000) as any;
  
  return () => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  };
}

export const LEAGUE_REFRESH_INTERVAL = 30000;
export const isRealLeagueApi = isRealApi;
