/**
 * Luban 配置加载器 - 后端权威版本
 * 读取 server/luban/tables/*.csv 与 luban.conf，保证前后端同源
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');

const TABLES_JSON = path.join(ROOT, 'server/data/tables.json');
const LUBAN_CONF = path.join(ROOT, 'server/luban/luban.conf');

let cachedConfig = null;

export function loadLubanConfig() {
  if (cachedConfig) return cachedConfig;
  
  try {
    const raw = fs.readFileSync(TABLES_JSON, 'utf-8');
    const data = JSON.parse(raw);
    cachedConfig = data;
    console.log(`[Luban] Loaded config v${data._meta?.version} with ${data.buildings?.length} buildings`);
    return data;
  } catch (e) {
    console.warn(`[Luban] Failed to load tables.json: ${e.message}, using fallback`);
    // fallback 最小配置
    return {
      _meta: { version: 1 },
      global: {
        earth_countdown_seconds: 3600,
        offline_cap_hours: 8,
        offline_efficiency: 0.5,
        launch_energy_req: 250000,
        launch_material_req: 25000,
        reward_prod_divisor: 1000000,
        reward_time_divisor: 600,
        reward_base: 3,
        max_offline_seconds: 28800,
        tick_ms: 250,
      },
      buildings: [],
    };
  }
}

export function getGlobalConfig() {
  const cfg = loadLubanConfig();
  const g = cfg.global || {};
  return {
    earthCountdownSeconds: g.earth_countdown_seconds ?? 3600,
    offlineCapHours: g.offline_cap_hours ?? 8,
    offlineEfficiency: g.offline_efficiency ?? 0.5,
    launchEnergyReq: g.launch_energy_req ?? 250000,
    launchMaterialReq: g.launch_material_req ?? 25000,
    rewardProdDivisor: g.reward_prod_divisor ?? 1000000,
    rewardTimeDivisor: g.reward_time_divisor ?? 600,
    rewardBase: g.reward_base ?? 3,
    maxOfflineSeconds: g.max_offline_seconds ?? 28800,
    tickMs: g.tick_ms ?? 250,
  };
}

export function loadLubanConf() {
  try {
    const raw = fs.readFileSync(LUBAN_CONF, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { version: "1.0.0", tables: [] };
  }
}
