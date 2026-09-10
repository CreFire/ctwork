/**
 * 排行榜服务 - 核心业务逻辑
 * 对应 dueGame 中的 LeagueActor
 */
import store from '../storage/memoryStore.mjs';
import { validateLeagueScore } from './antiCheat.mjs';
import { getGlobalConfig } from '../config/lubanLoader.mjs';

/**
 * 计算轮次分数 (与前端 engine.ts computeReward 同公式，但服务端权威)
 * @param {object} run - RunState
 * @param {object} meta - MetaState
 * @param {boolean} escaped - 是否逃生
 * @param {number} remainSec - 剩余秒
 * @returns {number} 分数
 */
export function computeRunScore(run, meta, escaped, remainSec = 0) {
  const global = getGlobalConfig();
  const produced = Math.max(0, run.stats?.energyTotal || 0);
  const prodPart = Math.floor(Math.sqrt(produced / global.rewardProdDivisor));
  
  if (escaped) {
    const base = global.rewardBase;
    const time = Math.floor(remainSec / global.rewardTimeDivisor);
    return base + prodPart + time;
  }
  
  // 死亡结算：1 + 一半产能分
  return 1 + Math.floor(prodPart / 2);
}

/**
 * 提交一次轮次成绩到排行榜
 * @param {object} params - {uid, account, run_score, escaped, run_id, route, cores, totalEnergy, bestRemainSec, runScoreDetails}
 * @returns {{ok: boolean, entry?: object, reason?: string}}
 */
export function submitRun(params) {
  const {
    uid,
    account,
    run_score,
    escaped,
    run_id,
    route,
    cores,
    totalEnergy,
    bestRemainSec,
    totalClicks,
    runs,
    escapes,
  } = params;

  if (!uid) return { ok: false, reason: 'uid required' };

  // 反作弊校验
  const validation = validateLeagueScore({ run_score, totalEnergy, run_id });
  if (!validation.ok) {
    console.warn(`[Leaderboard] Rejected uid=${uid}: ${validation.reason}`);
    return { ok: false, reason: validation.reason };
  }

  const sanitizedScore = validation.sanitizedScore ?? run_score;

  const entry = {
    uid,
    account: account || `User_${uid.slice(0, 6)}`,
    run_score: sanitizedScore,
    escaped: !!escaped,
    run_id: run_id || 1,
    route: route || null,
    cores: cores || 0,
    totalEnergy: totalEnergy || 0,
    bestRemainSec: bestRemainSec || 0,
    totalClicks: totalClicks || 0,
    runs: runs || 0,
    escapes: escapes || 0,
    ts: Date.now(),
  };

  const saved = store.submitRun(entry);
  console.log(`[Leaderboard] Submitted uid=${uid} score=${sanitizedScore} escaped=${escaped} rank will be recalculated`);

  return { ok: true, entry: saved };
}

/**
 * 获取排行榜 Top N + 我的排名
 * @param {string} uid - 当前用户 uid
 * @param {number} limit - Top 数量
 * @param {string} sortBy - 排序字段 (run_score, totalEnergy, cores)
 * @param {string} routeFilter - 路线过滤
 * @returns {{top: object[], myRank: object|null, myRankNumber: number|null, total: number}}
 */
export function getLeaderboard(uid, limit = 100, sortBy = 'run_score', routeFilter = null) {
  let result = store.getTopWithMyRank(uid, limit);

  // 路线过滤
  if (routeFilter) {
    const filteredTop = result.top.filter(e => e.route === routeFilter);
    result.top = filteredTop.slice(0, limit);
  }

  // 按不同字段排序 (扩展)
  if (sortBy !== 'run_score') {
    result.top.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    result.top = result.top.map((e, idx) => ({ ...e, rank: idx + 1 }));
  }

  return result;
}

/**
 * 获取赛季排行榜 (按时间窗口)
 * @param {number} seasonDays - 赛季天数
 */
export function getSeasonLeaderboard(uid, limit = 100, seasonDays = 7) {
  const cutoff = Date.now() - seasonDays * 24 * 3600 * 1000;
  const all = Array.from(store.leagueRuns.values()).filter(e => e.ts >= cutoff);
  all.sort((a, b) => b.run_score - a.run_score);
  
  const top = all.slice(0, limit).map((e, idx) => ({ ...e, rank: idx + 1 }));
  const myIdx = all.findIndex(e => e.uid === uid);
  
  return {
    top,
    myRank: myIdx >= 0 ? { ...all[myIdx], rank: myIdx + 1 } : null,
    myRankNumber: myIdx >= 0 ? myIdx + 1 : null,
    total: all.length,
    seasonDays,
    cutoff,
  };
}

/**
 * 获取用户历史最佳
 */
export function getUserBest(uid) {
  return store.leagueRuns.get(uid) || null;
}

/**
 * 获取排行榜统计
 */
export function getLeaderboardStats() {
  const all = Array.from(store.leagueRuns.values());
  if (all.length === 0) {
    return {
      totalPlayers: 0,
      avgScore: 0,
      maxScore: 0,
      escapeRate: 0,
      routeDistribution: {},
    };
  }

  const totalScore = all.reduce((sum, e) => sum + e.run_score, 0);
  const maxScore = Math.max(...all.map(e => e.run_score));
  const escapedCount = all.filter(e => e.escaped).length;
  
  const routeDist = {};
  for (const e of all) {
    const r = e.route || 'none';
    routeDist[r] = (routeDist[r] || 0) + 1;
  }

  return {
    totalPlayers: all.length,
    avgScore: Math.floor(totalScore / all.length),
    maxScore,
    escapeRate: escapedCount / all.length,
    routeDistribution: routeDist,
  };
}
