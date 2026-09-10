/**
 * 排行榜服务 - 前端业务层
 * 负责与后端交互，并提供模拟数据回退
 */
import { api, isRealApi } from "./api";
import { LEADERBOARD_NAMES } from "@/game/config";
import type { SaveState } from "@/game/engine";

export interface LeaderboardEntry {
  rank: number;
  uid: string;
  account: string;
  run_score: number;
  escaped: boolean;
  run_id: number;
  route: string | null;
  cores: number;
  totalEnergy: number;
  bestRemainSec: number;
  totalClicks?: number;
  ts: number;
  me?: boolean;
}

export interface LeaderboardResult {
  top: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  myRankNumber: number | null;
  total: number;
  source: "real" | "mock";
}

function hashStr(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 生成模拟排行榜 (用于 Mock 模式或真实后端失败回退)
 */
function generateMockLeaderboard(save: SaveState | null, uid: string, account: string): LeaderboardResult {
  if (!save) {
    return { top: [], myRank: null, myRankNumber: null, total: 0, source: "mock" };
  }

  const mine = save.meta.totalEnergy + save.run.res.energy;
  const list: LeaderboardEntry[] = LEADERBOARD_NAMES.slice(0, 20).map((name, i) => {
    const h = hashStr(uid + name);
    const factor = 0.35 + ((h % 100) / 100) * 2.4 - i * 0.08;
    const score = Math.max(1, mine * Math.max(0.05, factor));
    const routes = [null, "machine", "swarm", "psionic"];
    return {
      rank: 0,
      uid: `MOCK_${i}`,
      account: name,
      run_score: Math.floor(score),
      escaped: Math.random() > 0.5,
      run_id: Math.floor(Math.random() * 20) + 1,
      route: routes[Math.floor(Math.random() * routes.length)],
      cores: Math.floor(Math.random() * 50),
      totalEnergy: score,
      bestRemainSec: Math.floor(Math.random() * 3000),
      ts: Date.now() - Math.floor(Math.random() * 86400000 * 7),
    };
  });

  const myEntry: LeaderboardEntry = {
    rank: 0,
    uid,
    account: `${account} (你)`,
    run_score: Math.max(1, Math.floor(mine)),
    escaped: save.meta.escapes > 0,
    run_id: save.run.runId,
    route: save.run.route,
    cores: save.meta.cores,
    totalEnergy: save.meta.totalEnergy,
    bestRemainSec: save.meta.bestRemainSec,
    ts: Date.now(),
    me: true,
  };

  list.push(myEntry);

  list.sort((a, b) => b.run_score - a.run_score);
  list.forEach((e, idx) => (e.rank = idx + 1));

  const myIdx = list.findIndex(e => e.uid === uid);
  const myRank = myIdx >= 0 ? list[myIdx] : null;

  // 只返回 Top 8 模拟原有 UI
  const top8 = list.slice(0, 8);

  return {
    top: top8,
    myRank,
    myRankNumber: myRank?.rank || null,
    total: list.length,
    source: "mock",
  };
}

/**
 * 获取排行榜 (优先真实后端，失败回退模拟)
 */
export async function fetchLeaderboard(
  save: SaveState | null,
  uid: string,
  account: string,
  options: { limit?: number; route?: string; sortBy?: string } = {}
): Promise<LeaderboardResult> {
  const limit = options.limit || 100;

  if (isRealApi) {
    try {
      const data = await api.league.getTop({ uid, limit, route: options.route, sortBy: options.sortBy });
      
      // 转换后端数据为前端格式
      const top: LeaderboardEntry[] = (data.top || []).map((e: any) => ({
        rank: e.rank,
        uid: e.uid,
        account: e.account,
        run_score: e.run_score,
        escaped: e.escaped,
        run_id: e.run_id,
        route: e.route,
        cores: e.cores,
        totalEnergy: e.totalEnergy || e.total_energy || 0,
        bestRemainSec: e.bestRemainSec || e.best_remain_sec || 0,
        ts: e.ts,
        me: e.uid === uid,
      }));

      // 如果后端返回的 myRank 不在 top 中，标记
      if (data.myRank && !top.find(t => t.uid === uid)) {
        data.myRank.me = true;
      }

      return {
        top: top.slice(0, 8), // UI 保持 8 条，完整数据在 allTop
        myRank: data.myRank ? { ...data.myRank, me: true, rank: data.myRankNumber } : null,
        myRankNumber: data.myRankNumber,
        total: data.total,
        source: "real",
      };
    } catch (e) {
      console.warn("[Leaderboard] Real API failed, fallback to mock:", e);
      return generateMockLeaderboard(save, uid, account);
    }
  } else {
    return generateMockLeaderboard(save, uid, account);
  }
}

/**
 * 获取完整排行榜 (用于排行榜页面，不截断)
 */
export async function fetchFullLeaderboard(
  uid: string,
  options: { limit?: number; route?: string; sortBy?: string } = {}
): Promise<{ top: LeaderboardEntry[]; myRank: LeaderboardEntry | null; total: number; source: string }> {
  const limit = options.limit || 100;

  if (isRealApi) {
    try {
      const data = await api.league.getTop({ uid, limit, route: options.route, sortBy: options.sortBy });
      return {
        top: data.top || [],
        myRank: data.myRank || null,
        total: data.total || 0,
        source: "real",
      };
    } catch (e) {
      console.warn("[Leaderboard] Full fetch failed:", e);
      return { top: [], myRank: null, total: 0, source: "mock" };
    }
  } else {
    // Mock 模式下从 localStorage 读取
    try {
      const key = "ark_mock_league";
      const stored = JSON.parse(localStorage.getItem(key) || "{}");
      const entries = Object.values(stored) as any[];
      entries.sort((a: any, b: any) => b.run_score - a.run_score);
      const top = entries.slice(0, limit).map((e: any, idx: number) => ({
        ...e,
        rank: idx + 1,
        me: e.uid === uid,
      }));
      const myIdx = entries.findIndex((e: any) => e.uid === uid);
      return {
        top,
        myRank: myIdx >= 0 ? { ...entries[myIdx], rank: myIdx + 1, me: true } : null,
        total: entries.length,
        source: "mock",
      };
    } catch {
      return { top: [], myRank: null, total: 0, source: "mock" };
    }
  }
}

/**
 * 提交成绩到排行榜
 */
export async function submitToLeaderboard(save: SaveState, account: string): Promise<{ ok: boolean; rank?: number; reason?: string }> {
  const uid = save.uid;
  
  // 计算分数：使用与后端同公式的简化版
  // 实际应使用 engine.ts computeReward，但此处直接使用 totalEnergy + cores 估算
  const runScore = Math.floor(
    Math.sqrt(Math.max(0, save.run.stats.energyTotal) / 1000000) +
    save.meta.cores * 10 +
    (save.meta.escapes > 0 ? 100 : 0)
  );

  // 更精确的分数：直接使用 meta.totalEnergy 作为 run_score
  const preciseScore = Math.floor(save.meta.totalEnergy / 1000 + save.meta.cores * 50 + save.run.runId * 10);

  const entry = {
    uid,
    account,
    run_score: preciseScore,
    escaped: save.meta.escapes > 0,
    run_id: save.run.runId,
    route: save.run.route,
    cores: save.meta.cores,
    totalEnergy: save.meta.totalEnergy,
    bestRemainSec: save.meta.bestRemainSec,
    totalClicks: save.meta.totalClicks,
    runs: save.meta.runs,
    escapes: save.meta.escapes,
  };

  try {
    const result = await api.league.submitScore(entry);
    return { ok: true, rank: (result as any).rank };
  } catch (e) {
    console.warn("[Leaderboard] Submit failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export { isRealApi };
