/**
 * 玩家存档路由
 * GET /api/v1/player/save
 * POST /api/v1/player/save
 */
import express from 'express';
import store from '../storage/memoryStore.mjs';
import { validateResourceDelta, validateSaveVersion, checkRateLimit } from '../services/antiCheat.mjs';
import { authMiddleware } from '../middleware/auth.mjs';

const router = express.Router();

// 所有路由需要认证
router.use(authMiddleware);

router.get('/save', (req, res) => {
  const uid = req.uid;
  const save = store.getSave(uid);
  
  if (!save) {
    return res.status(404).json({ code: 404, message: 'Save not found', data: null });
  }

  res.json({
    uid,
    payload: save.payload,
    version: save.version,
    updated_at: save.updatedAt,
    updatedAt: save.updatedAt,
  });
});

router.post('/save', (req, res) => {
  const uid = req.uid;
  const ip = req.ip || 'unknown';
  
  // 限流：每用户每 5 秒最多 10 次保存
  const rl = checkRateLimit(`save:${uid}`, 20, 10000);
  if (!rl.ok) {
    return res.status(429).json({ code: 429, message: 'Save too frequent', retryAfter: rl.retryAfter });
  }

  const { payload, version } = req.body || {};
  
  if (!payload) {
    return res.status(400).json({ code: 400, message: 'payload required' });
  }

  let parsed;
  try {
    parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    return res.status(400).json({ code: 400, message: 'Invalid payload JSON' });
  }

  // 版本校验
  const verCheck = validateSaveVersion(parsed);
  if (!verCheck.ok) {
    console.warn(`[Player] Version check failed for ${uid}: ${verCheck.reason}`);
    // 不直接拒绝，记录警告
  }

  // 资源增量校验
  const prevSaveRaw = store.getSave(uid);
  if (prevSaveRaw) {
    try {
      const prevParsed = JSON.parse(prevSaveRaw.payload);
      const deltaMs = Date.now() - (prevParsed.lastTickAt || prevSaveRaw.updatedAt);
      const deltaCheck = validateResourceDelta(prevParsed, parsed, deltaMs);
      if (!deltaCheck.ok) {
        console.warn(`[AntiCheat] uid=${uid} ${deltaCheck.reason}`);
        // 对于挂机类，资源异常增长可能是作弊，但也可能是离线结算
        // 此处仅记录，不拒绝，生产环境可根据策略拒绝或标记
      }
    } catch (e) {
      console.warn(`[Player] Failed to validate delta for ${uid}: ${e.message}`);
    }
  }

  // 保存
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  store.setSave(uid, payloadStr, version || parsed.version || 1);

  res.json({
    ok: true,
    uid,
    version: version || parsed.version || 1,
    updated_at: Date.now(),
  });
});

router.delete('/save', (req, res) => {
  const uid = req.uid;
  store.deleteSave(uid);
  res.json({ ok: true, message: 'Save wiped' });
});

router.get('/profile', (req, res) => {
  const uid = req.uid;
  const user = store.getUserByUid(uid);
  if (!user) {
    return res.status(404).json({ code: 404, message: 'User not found' });
  }
  res.json({
    uid: user.uid,
    account: user.account,
    createdAt: user.createdAt,
    created_at: user.createdAt,
  });
});

export default router;
