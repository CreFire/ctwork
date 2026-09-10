/**
 * 限流中间件
 */
import { checkRateLimit } from '../services/antiCheat.mjs';

export function rateLimitMiddleware(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const result = checkRateLimit(ip, maxRequests, windowMs);
    
    if (!result.ok) {
      res.set('Retry-After', result.retryAfter || 60);
      return res.status(429).json({
        code: 429,
        message: result.reason,
        retryAfter: result.retryAfter,
      });
    }
    
    res.set('X-RateLimit-Remaining', result.remaining);
    next();
  };
}
