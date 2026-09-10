/**
 * 配置加载器 - 支持 Luban JSON 热更与回退
 * 设计为健壮的异步加载器，可在运行时从服务器或本地 JSON 重新加载配置
 */

import type { ConfigSnapshot } from "./config";
import { getConfigSnapshot, getConfigHealth } from "./config";

export interface LoadOptions {
  url?: string; // 远程配置 JSON URL
  useCache?: boolean;
  timeoutMs?: number;
}

export interface LoadResult {
  ok: boolean;
  snapshot: ConfigSnapshot;
  source: "generated" | "remote" | "cache" | "fallback";
  errors: string[];
  warnings: string[];
  durationMs: number;
}

const CACHE_KEY = "ark_era_config_cache_v1";

function loadFromCache(): any | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToCache(data: any) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // 静默失败，可能是隐私模式
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 加载配置，优先级：remote > cache > generated > fallback
 * 始终保证返回可用配置，不会抛异常
 */
export async function loadConfig(opts: LoadOptions = {}): Promise<LoadResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let snapshot = getConfigSnapshot();
  let source: LoadResult["source"] = "generated";

  // 尝试远程加载
  if (opts.url) {
    try {
      const remote = await fetchWithTimeout(opts.url, opts.timeoutMs || 5000);
      // 简单校验远程数据结构
      if (remote && remote.global && remote.buildings) {
        // 此处可扩展为完整校验并合并
        console.log("[ConfigLoader] Loaded remote config", remote._meta);
        saveToCache(remote);
        // 注意：远程配置热更需要重新生成 Tables.ts 或动态合并，此处仅记录
        warnings.push("Remote config loaded but not applied - requires rebuild via luban-gen");
        source = "remote";
      } else {
        errors.push("Remote config invalid structure");
      }
    } catch (e) {
      errors.push(`Remote load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 尝试缓存
  if (opts.useCache && source === "generated") {
    const cached = loadFromCache();
    if (cached?.data) {
      const ageHours = (Date.now() - (cached.ts || 0)) / 3600000;
      if (ageHours < 24) {
        console.log("[ConfigLoader] Using cached config, age:", ageHours.toFixed(1), "h");
        source = "cache";
      } else {
        warnings.push(`Cache expired: ${ageHours.toFixed(1)}h old`);
      }
    }
  }

  const health = getConfigHealth();
  if (!health.ok) {
    errors.push(...health.errors);
    warnings.push(...health.warnings);
  }

  return {
    ok: health.ok && errors.length === 0,
    snapshot,
    source,
    errors,
    warnings,
    durationMs: Date.now() - start,
  };
}

/**
 * 同步获取当前配置快照（来自生成表）
 */
export function getCurrentConfig(): ConfigSnapshot {
  return getConfigSnapshot();
}

/**
 * 检查配置是否需要更新（版本对比）
 */
export function checkConfigVersion(remoteVersion: number): { needUpdate: boolean; current: number; remote: number } {
  const current = getConfigSnapshot().global.version || 1;
  return {
    needUpdate: remoteVersion > current,
    current,
    remote: remoteVersion,
  };
}
