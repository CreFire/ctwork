/**
 * 反作弊服务 - 服务端权威校验
 * 参考 docs/ARCHITECTURE.md §2.4
 */
import { getGlobalConfig, loadLubanConfig } from '../config/lubanLoader.mjs';

const RES_KEYS = ['energy', 'material', 'research', 'special'];

/**
 * 校验资源增量是否合理
 * @param {object} prevSave - 上次存档
 * @param {object} newSave - 新存档
 * @param {number} deltaMs - 时间差
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateResourceDelta(prevSave, newSave, deltaMs) {
  if (!prevSave || !newSave) return { ok: true };
  
  const global = getGlobalConfig();
  const deltaSec = deltaMs / 1000;
  
  // 最大理论产出估算：基于建筑数量和基础产出
  // 简化版：假设每秒最大产出 10000 * 建筑数，实际应根据 Luban 表精确计算
  const maxRatePerSec = 50000; // 保守估计，实际可根据配置表计算
  const maxDelta = maxRatePerSec * deltaSec * 1.2; // 1.2 倍容差
  
  for (const k of RES_KEYS) {
    const prev = prevSave.run?.res?.[k] || 0;
    const curr = newSave.run?.res?.[k] || 0;
    const delta = curr - prev;
    
    // 资源减少是允许的（消费）
    if (delta < 0) continue;
    
    // 资源增加过多则可疑
    if (delta > maxDelta && delta > 100000) {
      return {
        ok: false,
        reason: `Resource ${k} delta ${delta} exceeds max ${maxDelta} in ${deltaSec}s`,
      };
    }
  }
  
  return { ok: true };
}

/**
 * 校验存档版本号
 */
export function validateSaveVersion(save) {
  const cfg = loadLubanConfig();
  const currentVersion = cfg.global?.version || 1;
  
  if (!save.version) {
    return { ok: false, reason: 'Missing version' };
  }
  
  if (save.version > currentVersion) {
    return { ok: false, reason: `Save version ${save.version} > current ${currentVersion}` };
  }
  
  return { ok: true, version: save.version };
}

/**
 * 校验排行榜分数是否合理
 * @param {object} entry - {run_score, totalEnergy, cores, run_id, escaped}
 * @returns {{ok: boolean, reason?: string, sanitizedScore?: number}}
 */
export function validateLeagueScore(entry) {
  const { run_score, totalEnergy, cores, run_id } = entry;
  
  if (typeof run_score !== 'number' || isNaN(run_score)) {
    return { ok: false, reason: 'Invalid run_score' };
  }
  
  if (run_score < 0) {
    return { ok: false, reason: 'Negative run_score' };
  }
  
  // 分数上限检查：假设单轮最大 1e9，超过则可疑
  if (run_score > 1e12) {
    return { ok: false, reason: `run_score ${run_score} exceeds max 1e12` };
  }
  
  // 如果提供了 totalEnergy，检查一致性
  if (totalEnergy && run_score < totalEnergy * 0.1) {
    // 分数不应远小于总能量
    console.warn(`[AntiCheat] run_score ${run_score} < totalEnergy ${totalEnergy} * 0.1, suspicious`);
  }
  
  // run_id 应合理
  if (run_id && (run_id < 1 || run_id > 1000000)) {
    return { ok: false, reason: `Invalid run_id ${run_id}` };
  }
  
  //  sanitized 分数：钳制到合理范围
  const sanitizedScore = Math.min(1e12, Math.max(0, Math.floor(run_score)));
  
  return { ok: true, sanitizedScore };
}

/**
 * 校验账号/密码
 */
export function validateAccount(account, password) {
  if (!account || typeof account !== 'string') {
    return { ok: false, reason: 'Account required' };
  }
  account = account.trim();
  if (account.length < 3) {
    return { ok: false, reason: 'Account too short (min 3)' };
  }
  if (account.length > 20) {
    return { ok: false, reason: 'Account too long (max 20)' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(account)) {
    return { ok: false, reason: 'Account contains invalid characters' };
  }
  
  if (!password || typeof password !== 'string') {
    return { ok: false, reason: 'Password required' };
  }
  if (password.length < 4) {
    return { ok: false, reason: 'Password too short (min 4)' };
  }
  if (password.length > 50) {
    return { ok: false, reason: 'Password too long (max 50)' };
  }
  
  return { ok: true, account: account.trim() };
}

/**
 * 简单限流检查 (内存版)
 */
const rateLimitMap = new Map(); // ip -> {count, resetAt}

export function checkRateLimit(ip, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(ip, entry);
    return { ok: true, remaining: maxRequests - 1 };
  }
  
  if (entry.count >= maxRequests) {
    return {
      ok: false,
      reason: 'Rate limit exceeded',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  
  entry.count++;
  return { ok: true, remaining: maxRequests - entry.count };
}

// 定期清理
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60000);
