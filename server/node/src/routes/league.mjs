/**
 * 排行榜路由 - 核心
 * GET /api/v1/league/top
 * POST /api/v1/league/submit
 * GET /api/v1/league/stats
 * GET /api/v1/league/season
 */
import express from 'express';
import store from '../storage/memoryStore.mjs';
import { submitRun, getLeaderboard, getSeasonLeaderboard, getUserBest, getLeaderboardStats } from '../services/leaderboard.mjs';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth.mjs';
import { checkRateLimit } from '../services/antiCheat.mjs';

const router = express.Router();

// 获取 Top 榜单 (可选认证，若带 token 则返回我的排名)
router.get('/top', optionalAuthMiddleware, (req, res) => {
  const uid = req.uid || req.query.uid;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const sortBy = req.query.sortBy || 'run_score';
  const route = req.query.route || null;

  const result = getLeaderboard(uid, limit, sortBy, route);

  res.json({
    top: result.top,
    myRank: result.myRank,
    myRankNumber: result.myRankNumber,
    total: result.total,
    limit,
    sortBy,
    routeFilter: route,
    ts: Date.now(),
  });
});

// 提交成绩 (需要认证)
router.post('/submit', authMiddleware, (req, res) => {
  const uid = req.uid;
  const ip = req.ip || 'unknown';

  const rl = checkRateLimit(`league:submit:${uid}`, 10, 60000);
  if (!rl.ok) {
    return res.status(429).json({ code: 429, message: 'Submit too frequent', retryAfter: rl.retryAfter });
  }

  const {
    run_score,
    runScore,
    escaped,
    run_id,
    runId,
    route,
    cores,
    totalEnergy,
    bestRemainSec,
    totalClicks,
    runs,
    escapes,
    account,
  } = req.body || {};

  const score = run_score ?? runScore;
  if (typeof score !== 'number') {
    return res.status(400).json({ code: 400, message: 'run_score required and must be number' });
  }

  // 获取账号名
  let acc = account;
  if (!acc) {
    const user = store.getUserByUid(uid);
    acc = user?.account || `User_${uid.slice(0, 6)}`;
  }

  const result = submitRun({
    uid,
    account: acc,
    run_score: score,
    escaped: !!escaped,
    run_id: run_id ?? runId ?? 1,
    route: route || null,
    cores: cores || 0,
    totalEnergy: totalEnergy || 0,
    bestRemainSec: bestRemainSec || 0,
    totalClicks: totalClicks || 0,
    runs: runs || 0,
    escapes: escapes || 0,
  });

  if (!result.ok) {
    return res.status(400).json({ code: 400, message: result.reason });
  }

  // 返回最新排名
  const rankInfo = store.getRank(uid);

  res.json({
    ok: true,
    entry: result.entry,
    rank: rankInfo?.rank || null,
    total: rankInfo?.total || null,
  });
});

// 获取赛季榜
router.get('/season', optionalAuthMiddleware, (req, res) => {
  const uid = req.uid || req.query.uid;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));

  const result = getSeasonLeaderboard(uid, limit, days);

  res.json({
    ...result,
    ts: Date.now(),
  });
});

// 获取我的最佳
router.get('/my-best', authMiddleware, (req, res) => {
  const uid = req.uid;
  const best = getUserBest(uid);
  
  if (!best) {
    return res.status(404).json({ code: 404, message: 'No record found' });
  }

  const rankInfo = store.getRank(uid);

  res.json({
    best,
    rank: rankInfo?.rank || null,
    total: rankInfo?.total || null,
  });
});

// 获取统计
router.get('/stats', (req, res) => {
  const stats = getLeaderboardStats();
  const storeStats = store.getStats();

  res.json({
    leaderboard: stats,
    store: storeStats,
    ts: Date.now(),
  });
});

// 管理接口：清空 (仅开发环境)
router.delete('/wipe', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ code: 403, message: 'Not allowed in production' });
  }
  store.leagueRuns.clear();
  store.leagueHistory = [];
  res.json({ ok: true, message: 'League wiped' });
});

export default router;
