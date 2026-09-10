/**
 * 认证中间件 - JWT 简化版 (内存 token)
 */
import store from '../storage/memoryStore.mjs';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: 'Missing Bearer token' });
  }

  const token = authHeader.slice(7);
  const session = store.getSession(token);
  
  if (!session) {
    return res.status(401).json({ code: 401, message: 'Invalid or expired token' });
  }

  // 附加 uid 到请求
  req.uid = session.uid;
  req.token = token;
  next();
}

export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = store.getSession(token);
    if (session) {
      req.uid = session.uid;
      req.token = token;
    }
  }
  next();
}
