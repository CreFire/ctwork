/**
 * 认证路由 - POST /api/v1/auth/login
 * 账号不存在自动注册，一个账号绑定一个 UID
 */
import express from 'express';
import crypto from 'crypto';
import store from '../storage/memoryStore.mjs';
import { validateAccount, checkRateLimit } from '../services/antiCheat.mjs';

const router = express.Router();

function hashPass(account, password) {
  // 演示用，生产环境用 bcrypt
  return crypto.createHash('sha256').update(`ark::${account}::${password}`).digest('hex');
}

function makeUid() {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0');
  return `U${t}${r}`.toUpperCase();
}

function makeToken(uid) {
  const rand = crypto.randomBytes(16).toString('hex');
  return Buffer.from(`${uid}:${rand}:${Date.now()}`).toString('base64');
}

router.post('/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  const rl = checkRateLimit(`login:${ip}`, 20, 60000);
  if (!rl.ok) {
    return res.status(429).json({ code: 429, message: 'Too many login attempts', retryAfter: rl.retryAfter });
  }

  const { account, password } = req.body || {};
  
  const validation = validateAccount(account, password);
  if (!validation.ok) {
    return res.status(400).json({ code: 400, message: validation.reason });
  }

  const cleanAccount = validation.account;
  const key = cleanAccount.toLowerCase();
  
  let user = store.getUserByAccount(cleanAccount);
  let isNew = false;

  if (!user) {
    // 自动注册
    user = {
      uid: makeUid(),
      account: cleanAccount,
      passHash: hashPass(cleanAccount, password),
      createdAt: Date.now(),
    };
    store.createUser(user);
    isNew = true;
    console.log(`[Auth] New user registered: ${cleanAccount} -> ${user.uid}`);
  } else {
    // 校验密码
    const hash = hashPass(cleanAccount, password);
    if (user.passHash !== hash) {
      return res.status(401).json({ code: 401, message: '密码错误:该账号已存在,请输入正确的密码' });
    }
  }

  const token = makeToken(user.uid);
  store.createSession(token, user.uid);

  res.json({
    token,
    uid: user.uid,
    account: user.account,
    is_new: isNew,
    isNew,
    createdAt: user.createdAt,
    created_at: user.createdAt,
  });
});

router.get('/profile', (req, res) => {
  // 需要 auth 中间件，但在路由中可选，兼容两种模式
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ code: 401, message: 'Missing token' });
  }
  const token = authHeader.slice(7);
  const session = store.getSession(token);
  if (!session) {
    return res.status(401).json({ code: 401, message: 'Invalid token' });
  }
  
  const user = store.getUserByUid(session.uid);
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
