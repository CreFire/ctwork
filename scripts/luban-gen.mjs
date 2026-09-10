#!/usr/bin/env node
/**
 * Luban 配置生成器 - 模拟 Luban 官方工具链
 * 读取 server/luban/tables/*.csv (兼容 server/luban/*.csv)
 * 解析 Bean/Enum 定义，校验数据，生成前端可用的 TypeScript & JSON
 * 
 * 设计目标：
 * - 健壮性：所有解析均带校验，缺失/非法值给出明确错误，支持默认值回退
 * - 可扩展：新增表只需在 luban.conf 中注册 + 添加 CSV
 * - 双端一致：同时生成 TS (client) 与 JSON (server 权威)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const LUBAN_CONF_PATH = path.join(ROOT, 'server/luban/luban.conf');
const TABLES_DIR = path.join(ROOT, 'server/luban/tables');
const LEGACY_TABLES_DIR = path.join(ROOT, 'server/luban');
const ENUMS_DIR = path.join(ROOT, 'server/luban/enums');
const BEANS_DIR = path.join(ROOT, 'server/luban/beans');

const OUT_TS_DIR = path.join(ROOT, 'src/game/generated');

/**
 * 源码指纹:对 server/luban 全量输入做 sha256。
 * 生成物不带时间戳 → 同样的表必然产出同样的文件,
 * CI 可以直接用 `git diff --exit-code` 判断「生成物是否已随表更新」。
 */
function sourceStamp() {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else { h.update(name); h.update(fs.readFileSync(p)); }
    }
  };
  walk(path.join(ROOT, 'server/luban'));
  return h.digest('hex').slice(0, 12);
}
const SRC_STAMP = sourceStamp();
const OUT_DATA_DIR = path.join(OUT_TS_DIR, 'data');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 解析 Luban CSV
 * 返回 { meta: {type,file,group,brief,mode,key,...}, headers: string[], rows: object[] }
 */
function parseLubanCsv(content, fileName) {
  if (!content) throw new Error(`Empty content for ${fileName}`);
  const lines = content.split(/\r?\n/);
  const meta = {};
  let headers = null;
  const rows = [];
  let lineNo = 0;

  for (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##')) {
      // ##key = value  or ##key=value or ##key value
      const m = line.match(/^##\s*([^=\s]+)\s*[=]?\s*(.*)$/);
      if (m) {
        const k = m[1].trim();
        let v = m[2].trim();
        // 去掉引号
        meta[k] = v;
      }
      continue;
    }
    if (line.startsWith('#')) {
      // header
      if (headers) {
        // second #? ignore if already has headers (maybe comment)
        // but Luban spec: only first # is header
        continue;
      }
      const hLine = line.replace(/^#/, '').trim();
      if (!hLine) continue;
      headers = hLine.split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }
    // data row
    if (!headers) {
      throw new Error(`[${fileName}:${lineNo}] Data row before header: ${raw}`);
    }
    // split by comma, but handle simple CSV (no quoted comma in our data)
    const parts = splitCsvLine(raw);
    if (parts.length === 0) continue;
    // 如果行列数少于表头，用空补齐；多于则截断并警告
    if (parts.length < headers.length) {
      // pad
      while (parts.length < headers.length) parts.push('');
    }
    if (parts.length > headers.length) {
      console.warn(`[${fileName}:${lineNo}] Column count ${parts.length} > headers ${headers.length}, truncating`);
      parts.length = headers.length;
    }
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = parts[i] !== undefined ? parts[i].trim() : '';
    });
    obj.__lineNo = lineNo;
    obj.__file = fileName;
    rows.push(obj);
  }

  if (!headers) throw new Error(`[${fileName}] No header row (#...) found`);
  return { meta, headers, rows };
}

function splitCsvLine(line) {
  // 支持引号包裹的字段，简单实现
  const res = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuote && line[i+1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res.map(s => s.trim());
}

function toNumber(v, def, ctx) {
  if (v === '' || v === undefined || v === null) return def;
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number '${v}' at ${ctx}`);
  }
  return n;
}

function toInt(v, def, ctx) {
  if (v === '' || v === undefined || v === null) return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid int '${v}' at ${ctx}`);
  }
  return n;
}

function toFloat(v, def, ctx) {
  if (v === '' || v === undefined || v === null) return def;
  const n = parseFloat(v);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid float '${v}' at ${ctx}`);
  }
  return n;
}

// 解析 Cost from columns like base_energy, base_material, etc or cost_energy etc
function parseCostFromRow(row, prefix = 'base_') {
  const cost = {};
  const e = row[`${prefix}energy`];
  const m = row[`${prefix}material`];
  const r = row[`${prefix}research`];
  const s = row[`${prefix}special`];
  if (e !== undefined && e !== '') cost.energy = toInt(e, 0, `cost.energy`);
  if (m !== undefined && m !== '') cost.material = toInt(m, 0, `cost.material`);
  if (r !== undefined && r !== '') cost.research = toInt(r, 0, `cost.research`);
  if (s !== undefined && s !== '') cost.special = toInt(s, 0, `cost.special`);
  // 清理空
  Object.keys(cost).forEach(k => { if (!cost[k]) delete cost[k]; });
  return Object.keys(cost).length ? cost : undefined;
}

function parseCostFromCostColumns(row, prefix = 'cost_') {
  const cost = {};
  const e = row[`${prefix}energy`];
  const m = row[`${prefix}material`];
  const r = row[`${prefix}research`];
  const s = row[`${prefix}special`];
  if (e !== undefined && e !== '') {
    const v = toInt(e, 0, `cost.energy`);
    if (v) cost.energy = v;
  }
  if (m !== undefined && m !== '') {
    const v = toInt(m, 0, `cost.material`);
    if (v) cost.material = v;
  }
  if (r !== undefined && r !== '') {
    const v = toInt(r, 0, `cost.research`);
    if (v) cost.research = v;
  }
  if (s !== undefined && s !== '') {
    const v = toInt(s, 0, `cost.special`);
    if (v) cost.special = v;
  }
  return cost;
}

// 解析 Effect 字符串: "mult:all:1.2" or "enableRoute:machine" or "note:文本" or "final"
// 多效果用 | 分隔
function parseEffectString(str, ctx) {
  if (!str || str.trim() === '') return null;
  const parts = str.split('|').map(s => s.trim()).filter(Boolean);
  const effects = parts.map(p => parseSingleEffect(p, ctx));
  return effects;
}

function parseSingleEffect(token, ctx) {
  // token examples:
  // mult:all:1.2
  // mult:energy:1.5
  // clickMult:2
  // autoClick:1
  // crit:0.04
  // countdown:600
  // enableRoute:machine
  // startKit:1
  // note:解锁建筑xxx
  // final
  if (!token) return null;
  if (token === 'final') {
    return { k: 'final' };
  }
  const segs = token.split(':');
  const k = segs[0].trim();
  if (!k) throw new Error(`Invalid effect token '${token}' at ${ctx}`);
  switch (k) {
    case 'mult': {
      // mult:res:v
      if (segs.length < 3) throw new Error(`mult effect needs res and v: '${token}' at ${ctx}`);
      const res = segs[1].trim();
      const v = toFloat(segs[2], 0, `${ctx} mult v`);
      return { k: 'mult', res, v };
    }
    case 'clickMult': {
      const v = toFloat(segs[1], 1, `${ctx} clickMult`);
      return { k: 'clickMult', v };
    }
    case 'autoClick': {
      const v = toFloat(segs[1], 0, `${ctx} autoClick`);
      return { k: 'autoClick', v };
    }
    case 'crit': {
      const v = toFloat(segs[1], 0, `${ctx} crit`);
      return { k: 'crit', v };
    }
    case 'countdown': {
      const v = toFloat(segs[1], 0, `${ctx} countdown`);
      return { k: 'countdown', v };
    }
    case 'enableRoute': {
      const route = segs[1]?.trim();
      if (!route) throw new Error(`enableRoute needs route id: '${token}' at ${ctx}`);
      return { k: 'enableRoute', route };
    }
    case 'startKit': {
      const v = toFloat(segs[1], 1, `${ctx} startKit`);
      return { k: 'startKit', v };
    }
    case 'note': {
      const text = segs.slice(1).join(':').trim();
      return { k: 'note', text };
    }
    default:
      throw new Error(`Unknown effect kind '${k}' in token '${token}' at ${ctx}`);
  }
}

// 解析 RouteUpgrade effect: 从 effect_k, effect_res, effect_v
function parseEffectFromColumns(row, ctx) {
  const k = row['effect_k'] || row['effectK'] || '';
  if (!k) return null;
  const res = row['effect_res'] || row['effectRes'] || undefined;
  const vRaw = row['effect_v'] || row['effectV'] || '';
  const route = row['effect_route'] || undefined;
  const text = row['effect_text'] || undefined;
  if (k === 'final') return { k: 'final' };
  if (k === 'note') return { k: 'note', text: text || row['desc'] || '' };
  if (k === 'enableRoute') return { k: 'enableRoute', route: route || res };
  const eff = { k };
  if (res) eff.res = res;
  if (route) eff.route = route;
  if (text) eff.text = text;
  if (vRaw !== '' && vRaw !== undefined) {
    eff.v = toFloat(vRaw, 0, `${ctx} effect_v`);
  }
  return eff;
}

function loadCsvTable(fileName) {
  // try tables dir first, then legacy
  let content = readFileSafe(path.join(TABLES_DIR, fileName));
  if (!content) content = readFileSafe(path.join(LEGACY_TABLES_DIR, fileName));
  if (!content) throw new Error(`Table file not found: ${fileName} (searched ${TABLES_DIR} and ${LEGACY_TABLES_DIR})`);
  return parseLubanCsv(content, fileName);
}

// ---------- Generators for each table ----------

function genGlobal() {
  const { rows } = loadCsvTable('tb_global.csv');
  const map = {};
  for (const r of rows) {
    const key = r['key'];
    const valRaw = r['value'];
    if (!key) continue;
    // 自动类型推断
    let val;
    if (valRaw === '' ) continue;
    if (!isNaN(valRaw) && valRaw.includes('.')) {
      val = parseFloat(valRaw);
    } else if (!isNaN(valRaw) && valRaw.trim() !== '') {
      // int
      if (valRaw.includes('.')) val = parseFloat(valRaw);
      else val = parseInt(valRaw, 10);
    } else {
      val = valRaw;
    }
    map[key] = val;
  }
  // 校验必要字段
  const required = ['earth_countdown_seconds','offline_cap_hours','offline_efficiency','click_base_power','crit_mult','milestone_every','milestone_mult','launch_energy_req','launch_material_req','tick_ms','autosave_ms','reward_base','event_min_gap','event_max_gap','first_event_delay_seconds','crate_life_seconds'];
  for (const k of required) {
    if (!(k in map)) throw new Error(`Global missing required key: ${k}`);
  }
  return map;
}

function genBuilding() {
  const { rows } = loadCsvTable('tb_building.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) throw new Error(`Building missing id at line ${r.__lineNo}`);
    if (ids.has(id)) throw new Error(`Duplicate building id: ${id}`);
    ids.add(id);
    const baseCost = parseCostFromRow(r, 'base_');
    const scale = toFloat(r['scale'], 1.15, `building ${id} scale`);
    if (scale < 1.0 || scale > 2.0) throw new Error(`Building ${id} scale ${scale} out of range [1.0,2.0]`);
    const perSec = toFloat(r['per_sec'], 0, `building ${id} per_sec`);
    if (perSec <= 0) throw new Error(`Building ${id} per_sec must >0`);
    const produces = r['produces'];
    const chain = r['chain'];
    if (!produces) throw new Error(`Building ${id} missing produces`);
    if (!chain) throw new Error(`Building ${id} missing chain`);
    list.push({
      id,
      name: r['name'],
      en: r['en'] || r['name'],
      chain,
      desc: r['desc'] || '',
      baseCost: baseCost || {},
      scale,
      produces,
      perSec,
      unlockResearch: r['unlock_research'] || undefined,
      unlockRoute: r['unlock_route'] || undefined,
    });
  }
  return list;
}

function genClickUpgrade() {
  const { rows } = loadCsvTable('tb_click_upgrade.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate click upgrade id: ${id}`);
    ids.add(id);
    const effect = parseEffectFromColumns(r, `click_upgrade ${id}`);
    if (!effect) throw new Error(`Click upgrade ${id} missing effect`);
    list.push({
      id,
      name: r['name'],
      desc: r['desc'] || '',
      baseCost: toInt(r['baseCost'], 0, `click_upgrade ${id} baseCost`),
      scale: toFloat(r['scale'], 1.0, `click_upgrade ${id} scale`),
      max: toInt(r['max'], 1, `click_upgrade ${id} max`),
      effect,
      perText: r['perText'] || '',
    });
  }
  return list;
}

function genEra() {
  const { rows } = loadCsvTable('tb_era.csv');
  const list = [];
  for (const r of rows) {
    list.push({
      id: toInt(r['id'], 0, `era id`),
      name: r['name'],
      en: r['en'] || r['name'],
      flavor: r['flavor'] || '',
    });
  }
  // sort by id
  list.sort((a,b) => a.id - b.id);
  return list;
}

function genResearch() {
  const { rows } = loadCsvTable('tb_research.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate research id: ${id}`);
    ids.add(id);
    const cost = parseCostFromCostColumns(r, 'cost_');
    const reqRaw = r['req'] || '';
    const req = reqRaw ? reqRaw.split('|').map(s => s.trim()).filter(Boolean) : [];
    const effectsRaw = r['effects'] || '';
    const effects = effectsRaw ? parseEffectString(effectsRaw, `research ${id}`) : [];
    const era = toInt(r['era'], 0, `research ${id} era`);
    if (era < 0 || era > 5) throw new Error(`Research ${id} era ${era} out of range 0-5`);
    list.push({
      id,
      name: r['name'],
      desc: r['desc'] || '',
      quote: r['quote'] || undefined,
      era,
      cost,
      req,
      effects: effects || [],
    });
  }
  return list;
}

function genRoute() {
  const { rows } = loadCsvTable('tb_route.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate route id: ${id}`);
    ids.add(id);
    const perksRaw = r['perks'] || '';
    const perks = perksRaw ? perksRaw.split('|').map(s => s.trim()).filter(Boolean) : [];
    list.push({
      id,
      name: r['name'],
      title: r['title'] || '',
      en: r['en'] || r['name'],
      desc: r['desc'] || '',
      perks,
      specialName: r['specialName'] || '',
      specialEn: r['specialEn'] || '',
      requireResearch: r['requireResearch'] || '',
    });
  }
  return list;
}

function genRouteUpgrade() {
  const { rows } = loadCsvTable('tb_route_upgrade.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate route upgrade id: ${id}`);
    ids.add(id);
    const effect = parseEffectFromColumns(r, `route_upgrade ${id}`);
    if (!effect) throw new Error(`Route upgrade ${id} missing effect`);
    const max = toInt(r['max'], 10, `route_upgrade ${id} max`);
    if (max < 1 || max > 100) throw new Error(`Route upgrade ${id} max ${max} out of range`);
    list.push({
      id,
      route: r['route'],
      name: r['name'],
      desc: r['desc'] || '',
      max,
      baseCost: toInt(r['baseCost'], 0, `route_upgrade ${id} baseCost`),
      scale: toFloat(r['scale'], 1.0, `route_upgrade ${id} scale`),
      effect,
    });
  }
  return list;
}

function genCoreUpgrade() {
  const { rows } = loadCsvTable('tb_core_upgrade.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate core upgrade id: ${id}`);
    ids.add(id);
    const effect = parseEffectFromColumns(r, `core_upgrade ${id}`);
    if (!effect) throw new Error(`Core upgrade ${id} missing effect`);
    const max = toInt(r['max'], 10, `core_upgrade ${id} max`);
    if (max < 1 || max > 100) throw new Error(`Core upgrade ${id} max ${max} out of range`);
    list.push({
      id,
      name: r['name'],
      desc: r['desc'] || '',
      max,
      base: toInt(r['base'], 0, `core_upgrade ${id} base`),
      inc: toInt(r['inc'], 0, `core_upgrade ${id} inc`),
      effectPer: effect,
    });
  }
  return list;
}

function genStory() {
  const { rows } = loadCsvTable('tb_story.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate story id: ${id}`);
    ids.add(id);
    list.push({
      id,
      remainSec: toInt(r['remainSec'], 0, `story ${id} remainSec`),
      text: r['text'] || '',
      tone: r['tone'] || 'info',
    });
  }
  // sort descending by remainSec (as original)
  list.sort((a,b) => b.remainSec - a.remainSec);
  return list;
}

function genRandomEvent() {
  const { rows } = loadCsvTable('tb_random_event.csv');
  const list = [];
  const ids = new Set();
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate random event id: ${id}`);
    ids.add(id);
    const kind = r['kind'] || 'instant';
    const res = r['res'] || undefined;
    const secondsRaw = r['seconds'];
    const deadlineRaw = r['deadlineAdd'];
    list.push({
      id,
      name: r['name'] || '',
      text: r['text'] || '',
      tone: r['tone'] || 'info',
      kind,
      res: res || undefined,
      seconds: secondsRaw !== '' && secondsRaw !== undefined ? toInt(secondsRaw, 0, `event ${id} seconds`) : undefined,
      deadlineAdd: deadlineRaw !== '' && deadlineRaw !== undefined ? toInt(deadlineRaw, 0, `event ${id} deadlineAdd`) : undefined,
      weight: r['weight'] ? toInt(r['weight'], 10, `event ${id} weight`) : 10,
    });
  }
  return list;
}

function genResMeta() {
  const { rows } = loadCsvTable('tb_res_meta.csv');
  const map = {};
  for (const r of rows) {
    const id = r['id'];
    if (!id) continue;
    map[id] = {
      name: r['name'] || id,
      en: r['en'] || id.toUpperCase(),
      color: r['color'] || '#ffffff',
    };
  }
  return map;
}

function genLeaderboardNames() {
  try {
    const { rows } = loadCsvTable('tb_leaderboard_name.csv');
    return rows.map(r => r['name']).filter(Boolean);
  } catch (e) {
    console.warn(`Leaderboard names table missing, using fallback: ${e.message}`);
    return [
      "文明观察者#4211", "洛希极限", "猎户座之泪", "白矮星信使", "引力波哀伤",
      "第三旋翼", "量子凝视者", "暗淡蓝点", "奥尔特云海", "王维轨道站"
    ];
  }
}

// ---------- Main ----------

function main() {
  console.log('[Luban] Starting generation...');
  console.log(`[Luban] Root: ${ROOT}`);
  console.log(`[Luban] Config: ${LUBAN_CONF_PATH}`);

  const confRaw = readFileSafe(LUBAN_CONF_PATH);
  if (!confRaw) {
    console.warn('[Luban] luban.conf not found, using defaults');
  } else {
    try {
      const conf = JSON.parse(confRaw);
      console.log(`[Luban] Loaded luban.conf version ${conf.version}, tables: ${conf.tables?.length}`);
    } catch (e) {
      console.warn(`[Luban] Failed to parse luban.conf: ${e.message}`);
    }
  }

  ensureDir(OUT_TS_DIR);
  ensureDir(OUT_DATA_DIR);

  // Generate all tables with robust error handling
  let globalMap, buildings, clickUpgrades, eras, researches, routes, routeUpgrades, coreUpgrades, stories, randomEvents, resMeta, leaderboardNames;

  try {
    globalMap = genGlobal();
    console.log(`[Luban] Global: ${Object.keys(globalMap).length} keys`);
  } catch (e) {
    console.error(`[Luban] Global gen failed: ${e.message}`);
    throw e;
  }

  try {
    buildings = genBuilding();
    console.log(`[Luban] Buildings: ${buildings.length}`);
  } catch (e) {
    console.error(`[Luban] Building gen failed: ${e.message}`);
    throw e;
  }

  try {
    clickUpgrades = genClickUpgrade();
    console.log(`[Luban] ClickUpgrades: ${clickUpgrades.length}`);
  } catch (e) {
    console.error(`[Luban] ClickUpgrade gen failed: ${e.message}`);
    throw e;
  }

  try {
    eras = genEra();
    console.log(`[Luban] Eras: ${eras.length}`);
  } catch (e) {
    console.error(`[Luban] Era gen failed: ${e.message}`);
    throw e;
  }

  try {
    researches = genResearch();
    console.log(`[Luban] Researches: ${researches.length}`);
  } catch (e) {
    console.error(`[Luban] Research gen failed: ${e.message}`);
    throw e;
  }

  try {
    routes = genRoute();
    console.log(`[Luban] Routes: ${routes.length}`);
  } catch (e) {
    console.error(`[Luban] Route gen failed: ${e.message}`);
    throw e;
  }

  try {
    routeUpgrades = genRouteUpgrade();
    console.log(`[Luban] RouteUpgrades: ${routeUpgrades.length}`);
  } catch (e) {
    console.error(`[Luban] RouteUpgrade gen failed: ${e.message}`);
    throw e;
  }

  try {
    coreUpgrades = genCoreUpgrade();
    console.log(`[Luban] CoreUpgrades: ${coreUpgrades.length}`);
  } catch (e) {
    console.error(`[Luban] CoreUpgrade gen failed: ${e.message}`);
    throw e;
  }

  try {
    stories = genStory();
    console.log(`[Luban] Stories: ${stories.length}`);
  } catch (e) {
    console.error(`[Luban] Story gen failed: ${e.message}`);
    throw e;
  }

  try {
    randomEvents = genRandomEvent();
    console.log(`[Luban] RandomEvents: ${randomEvents.length}`);
  } catch (e) {
    console.error(`[Luban] RandomEvent gen failed: ${e.message}`);
    throw e;
  }

  try {
    resMeta = genResMeta();
    console.log(`[Luban] ResMeta: ${Object.keys(resMeta).length}`);
  } catch (e) {
    console.error(`[Luban] ResMeta gen failed: ${e.message}`);
    throw e;
  }

  try {
    leaderboardNames = genLeaderboardNames();
    console.log(`[Luban] LeaderboardNames: ${leaderboardNames.length}`);
  } catch (e) {
    console.warn(`[Luban] LeaderboardNames fallback: ${e.message}`);
    leaderboardNames = [];
  }

  // Build combined JSON for validation & runtime
  const combined = {
    _meta: {
      sourceHash: SRC_STAMP,
      version: globalMap.version || 1,
      generator: 'luban-gen.mjs',
    },
    global: globalMap,
    buildings,
    clickUpgrades,
    eras,
    researches,
    routes,
    routeUpgrades,
    coreUpgrades,
    stories,
    randomEvents,
    resMeta,
    leaderboardNames,
  };

  // Write JSON data
  const jsonPath = path.join(OUT_DATA_DIR, 'tables.json');
  fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2), 'utf-8');
  console.log(`[Luban] Wrote ${jsonPath}`);

  // Also write individual JSONs for Go server
  const serverDataDir = path.join(ROOT, 'server/data');
  ensureDir(serverDataDir);
  fs.writeFileSync(path.join(serverDataDir, 'tables.json'), JSON.stringify(combined, null, 2), 'utf-8');

  // Generate TypeScript Enums
  const enumsTs = `/**
 * Auto-generated by luban-gen.mjs - DO NOT EDIT MANUALLY
 * Source: server/luban/enums/*.csv + Defines/__enums__.xml
 * Source hash: ${SRC_STAMP}
 */

export const ResourceType = {
  energy: "energy",
  material: "material",
  research: "research",
  special: "special",
  all: "all",
} as const;
export type ResourceType = typeof ResourceType[keyof typeof ResourceType];

export const ChainType = {
  energy: "energy",
  material: "material",
  research: "research",
  special: "special",
} as const;
export type ChainType = typeof ChainType[keyof typeof ChainType];

export const RouteId = {
  machine: "machine",
  swarm: "swarm",
  psionic: "psionic",
} as const;
export type RouteId = typeof RouteId[keyof typeof RouteId];

export const EffectKind = {
  mult: "mult",
  clickMult: "clickMult",
  autoClick: "autoClick",
  crit: "crit",
  countdown: "countdown",
  enableRoute: "enableRoute",
  startKit: "startKit",
  note: "note",
  final: "final",
} as const;
export type EffectKind = typeof EffectKind[keyof typeof EffectKind];

export const EventKind = {
  instant: "instant",
  crate: "crate",
  deadline: "deadline",
} as const;
export type EventKind = typeof EventKind[keyof typeof EventKind];

export const EventTone = {
  info: "info",
  success: "success",
  warn: "warn",
  danger: "danger",
  story: "story",
} as const;
export type EventTone = typeof EventTone[keyof typeof EventTone];

export const ENUM_META = {
  ResourceType: [
    { name: "energy", value: 0, comment: "能量" },
    { name: "material", value: 1, comment: "物资" },
    { name: "research", value: 2, comment: "科研" },
    { name: "special", value: 3, comment: "特殊资源" },
    { name: "all", value: 4, comment: "全部资源" },
  ],
  RouteId: [
    { name: "machine", value: 0, comment: "机械飞升", specialName: "算力", specialEn: "COMPUTE" },
    { name: "swarm", value: 1, comment: "蜂群意志", specialName: "生物质", specialEn: "BIOMASS" },
    { name: "psionic", value: 2, comment: "灵能升华", specialName: "灵能", specialEn: "PSION" },
  ],
} as const;
`;

  fs.writeFileSync(path.join(OUT_TS_DIR, 'Enums.ts'), enumsTs, 'utf-8');
  console.log('[Luban] Wrote Enums.ts');

  // Generate Beans.ts
  const beansTs = `/**
 * Auto-generated by luban-gen.mjs - DO NOT EDIT MANUALLY
 * Source: server/luban/beans/*.csv + Defines/__beans__.xml
 * Source hash: ${SRC_STAMP}
 */

import type { ResourceType, ChainType, RouteId, EffectKind, EventKind, EventTone } from "./Enums";

export interface Cost {
  energy?: number;
  material?: number;
  research?: number;
  special?: number;
}

export interface Effect {
  k: EffectKind;
  res?: ResourceType | "all";
  v?: number;
  route?: RouteId;
  text?: string;
}

export interface Building {
  id: string;
  name: string;
  en: string;
  chain: ChainType;
  desc: string;
  baseCost: Cost;
  scale: number;
  produces: ResourceType;
  perSec: number;
  unlockResearch?: string;
  unlockRoute?: RouteId;
}

export interface ClickUpgrade {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  scale: number;
  max: number;
  effect: Effect;
  perText: string;
}

export interface Era {
  id: number;
  name: string;
  en: string;
  flavor: string;
}

export interface Research {
  id: string;
  name: string;
  desc: string;
  quote?: string;
  era: number;
  cost: Cost;
  req: string[];
  effects: Effect[];
}

export interface Route {
  id: RouteId;
  name: string;
  title: string;
  en: string;
  desc: string;
  perks: string[];
  specialName: string;
  specialEn: string;
  requireResearch: string;
}

export interface RouteUpgrade {
  id: string;
  route: RouteId;
  name: string;
  desc: string;
  max: number;
  baseCost: number;
  scale: number;
  effect: Effect;
}

export interface CoreUpgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number;
  inc: number;
  effectPer: Effect;
}

export interface StoryEvent {
  id: string;
  remainSec: number;
  text: string;
  tone: EventTone;
}

export interface RandomEvent {
  id: string;
  name: string;
  text: string;
  tone: EventTone;
  kind: EventKind;
  res?: ResourceType;
  seconds?: number;
  deadlineAdd?: number;
  weight?: number;
}

export interface ResMeta {
  name: string;
  en: string;
  color: string;
}

export interface GlobalConfig {
  version: number;
  earthCountdownSeconds: number;
  offlineCapHours: number;
  offlineEfficiency: number;
  clickBasePower: number;
  critMult: number;
  milestoneEvery: number;
  milestoneMult: number;
  launchEnergyReq: number;
  launchMaterialReq: number;
  tickMs: number;
  autosaveMs: number;
  rewardBase: number;
  eventMinGap: number;
  eventMaxGap: number;
  firstEventDelaySeconds: number;
  crateLifeSeconds: number;
  crateMinGainSeconds: number;
  kitEnergyPerLevel: number;
  kitMaterialPerLevel: number;
  kitResearchPerLevel: number;
  anchorBonusSeconds: number;
  rewardTimeDivisor: number;
  rewardProdDivisor: number;
  maxCritRate: number;
  maxOfflineSeconds: number;
  [key: string]: any;
}
`;

  fs.writeFileSync(path.join(OUT_TS_DIR, 'Beans.ts'), beansTs, 'utf-8');
  console.log('[Luban] Wrote Beans.ts');

  // Generate Tables.ts (typed constants from CSV)
  const tablesTs = `/**
 * Auto-generated by luban-gen.mjs - DO NOT EDIT MANUALLY
 * Source: server/luban/tables/*.csv
 * Source hash: ${SRC_STAMP}
 * 
 * 此文件为 Luban 导出的前端配置表，双端共享，与 Go 服务端同源
 */

import type { Building, ClickUpgrade, Era, Research, Route, RouteUpgrade, CoreUpgrade, StoryEvent, RandomEvent, ResMeta, GlobalConfig } from "./Beans";

export const GLOBAL: GlobalConfig = ${JSON.stringify({
    version: globalMap.version ?? 1,
    earthCountdownSeconds: globalMap.earth_countdown_seconds ?? 3600,
    offlineCapHours: globalMap.offline_cap_hours ?? 8,
    offlineEfficiency: globalMap.offline_efficiency ?? 0.5,
    clickBasePower: globalMap.click_base_power ?? 1,
    critMult: globalMap.crit_mult ?? 5,
    milestoneEvery: globalMap.milestone_every ?? 25,
    milestoneMult: globalMap.milestone_mult ?? 2,
    launchEnergyReq: globalMap.launch_energy_req ?? 250000,
    launchMaterialReq: globalMap.launch_material_req ?? 25000,
    tickMs: globalMap.tick_ms ?? 250,
    autosaveMs: globalMap.autosave_ms ?? 8000,
    rewardBase: globalMap.reward_base ?? 3,
    eventMinGap: globalMap.event_min_gap ?? 170,
    eventMaxGap: globalMap.event_max_gap ?? 400,
    firstEventDelaySeconds: globalMap.first_event_delay_seconds ?? 150,
    crateLifeSeconds: globalMap.crate_life_seconds ?? 45,
    crateMinGainSeconds: globalMap.crate_min_gain_seconds ?? 180,
    kitEnergyPerLevel: globalMap.kit_energy_per_level ?? 4000,
    kitMaterialPerLevel: globalMap.kit_material_per_level ?? 150,
    kitResearchPerLevel: globalMap.kit_research_per_level ?? 20,
    anchorBonusSeconds: globalMap.anchor_bonus_seconds ?? 600,
    rewardTimeDivisor: globalMap.reward_time_divisor ?? 600,
    rewardProdDivisor: globalMap.reward_prod_divisor ?? 1000000,
    maxCritRate: globalMap.max_crit_rate ?? 0.95,
    maxOfflineSeconds: globalMap.max_offline_seconds ?? 28800,
    // raw map for extensibility
    _raw: globalMap,
  }, null, 2)} as any;

export const BUILDINGS: Building[] = ${JSON.stringify(buildings, null, 2)};

export const CLICK_UPGRADES: ClickUpgrade[] = ${JSON.stringify(clickUpgrades, null, 2)};

export const ERAS: Era[] = ${JSON.stringify(eras, null, 2)};

export const RESEARCH: Research[] = ${JSON.stringify(researches, null, 2)};

export const ROUTES: Route[] = ${JSON.stringify(routes, null, 2)};

export const ROUTE_UPGRADES: RouteUpgrade[] = ${JSON.stringify(routeUpgrades, null, 2)};

export const CORE_UPGRADES: CoreUpgrade[] = ${JSON.stringify(coreUpgrades, null, 2)};

export const STORY_EVENTS: StoryEvent[] = ${JSON.stringify(stories, null, 2)};

export const RANDOM_EVENTS: RandomEvent[] = ${JSON.stringify(randomEvents, null, 2)};

export const RES_META: Record<string, ResMeta> = ${JSON.stringify(resMeta, null, 2)};

export const LEADERBOARD_NAMES: string[] = ${JSON.stringify(leaderboardNames, null, 2)};

export const EVENT_MIN_GAP = GLOBAL.eventMinGap;
export const EVENT_MAX_GAP = GLOBAL.eventMaxGap;

// 索引表（Luban map 模式）
export const BUILDING_MAP = new Map(BUILDINGS.map(b => [b.id, b]));
export const CLICK_UPGRADE_MAP = new Map(CLICK_UPGRADES.map(u => [u.id, u]));
export const RESEARCH_MAP = new Map(RESEARCH.map(r => [r.id, r]));
export const ROUTE_MAP = new Map(ROUTES.map(r => [r.id, r]));
export const ROUTE_UPGRADE_MAP = new Map(ROUTE_UPGRADES.map(u => [u.id, u]));
export const CORE_UPGRADE_MAP = new Map(CORE_UPGRADES.map(u => [u.id, u]));
export const RANDOM_EVENT_MAP = new Map(RANDOM_EVENTS.map(e => [e.id, e]));

// 兼容旧版命名
export const BUILDINGS_BY_ID = BUILDING_MAP;
`;

  fs.writeFileSync(path.join(OUT_TS_DIR, 'Tables.ts'), tablesTs, 'utf-8');
  console.log('[Luban] Wrote Tables.ts');

  // Generate index.ts for convenient import
  const indexTs = `/**
 * Luban 生成配置入口
 * 导出所有表、Bean、Enum，供游戏引擎使用
 */
export * from "./Enums";
export * from "./Beans";
export * from "./Tables";
export { default as RAW_JSON } from "./data/tables.json";
`;
  fs.writeFileSync(path.join(OUT_TS_DIR, 'index.ts'), indexTs, 'utf-8');

  // ---------- Generate Go 配置(服务端权威,与前端同源) ----------
  const goOutDir = path.join(ROOT, 'server/internal/config/gen');
  ensureDir(goOutDir);
  const goStr = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const goNum = (v) => (v === undefined || v === null || v === '' ? '0' : String(Number(v)));
  const goInt = (v) => (v === undefined || v === null || v === '' ? '0' : String(Math.trunc(Number(v))));
  const goCost = (c) => `Cost{Energy: ${goNum(c?.energy)}, Material: ${goNum(c?.material)}, Research: ${goNum(c?.research)}, Special: ${goNum(c?.special)}}`;
  const goEffect = (e) => `Effect{K: ${goStr(e?.k)}, Res: ${goStr(e?.res)}, V: ${goNum(e?.v)}, Route: ${goStr(e?.route)}, Text: ${goStr(e?.text)}}`;
  const goStrs = (arr) => `[]string{${(arr || []).map(goStr).join(', ')}}`;
  const goVal = (v) => (typeof v === 'string' ? goStr(v) : goNum(v));

  const goCode = `// Code generated by luban-gen.mjs; DO NOT EDIT.
// 数据源: server/luban/tables/*.csv —— 前端(src/game/generated)与本文件同源,
// 与 server/internal/engine/config.go 的一致性由 scripts/check-config-parity.mjs 保证。
package config

// Global 全局常量(tb_global.csv)
var Global = map[string]interface{}{
${Object.entries(globalMap).map(([k, v]) => `\t${goStr(k)}: ${goVal(v)},`).join('\n')}
}

type Cost struct {
\tEnergy   float64
\tMaterial float64
\tResearch float64
\tSpecial  float64
}

type Effect struct {
\tK     string
\tRes   string
\tV     float64
\tRoute string
\tText  string
}

type Building struct {
\tID             string
\tName           string
\tEn             string
\tChain          string
\tDesc           string
\tBaseCost       Cost
\tScale          float64
\tProduces       string
\tPerSec         float64
\tUnlockResearch string
\tUnlockRoute    string
}

type ClickUpgrade struct {
\tID       string
\tName     string
\tDesc     string
\tBaseCost float64
\tScale    float64
\tMax      int
\tEffect   Effect
\tPerText  string
}

type Era struct {
\tID     int
\tName   string
\tEn     string
\tFlavor string
}

type Research struct {
\tID      string
\tName    string
\tDesc    string
\tQuote   string
\tEra     int
\tCost    Cost
\tReq     []string
\tEffects []Effect
}

type Route struct {
\tID              string
\tName            string
\tTitle           string
\tEn              string
\tDesc            string
\tPerks           []string
\tSpecialName     string
\tSpecialEn       string
\tRequireResearch string
}

type RouteUpgrade struct {
\tID       string
\tRoute    string
\tName     string
\tDesc     string
\tMax      int
\tBaseCost float64
\tScale    float64
\tEffect   Effect
}

type CoreUpgrade struct {
\tID        string
\tName      string
\tDesc      string
\tMax       int
\tBase      float64
\tInc       float64
\tEffectPer Effect
}

type StoryEvent struct {
\tID        string
\tRemainSec float64
\tText      string
\tTone      string
}

type RandomEvent struct {
\tID          string
\tName        string
\tText        string
\tTone        string
\tKind        string
\tRes         string
\tSeconds     float64
\tDeadlineAdd float64
\tWeight      float64
}

type ResMeta struct {
\tID    string
\tName  string
\tEn    string
\tColor string
}

var Buildings = []Building{
${buildings.map((b) => `\t{ID: ${goStr(b.id)}, Name: ${goStr(b.name)}, En: ${goStr(b.en)}, Chain: ${goStr(b.chain)}, Desc: ${goStr(b.desc)}, BaseCost: ${goCost(b.baseCost)}, Scale: ${goNum(b.scale)}, Produces: ${goStr(b.produces)}, PerSec: ${goNum(b.perSec)}, UnlockResearch: ${goStr(b.unlockResearch)}, UnlockRoute: ${goStr(b.unlockRoute)}},`).join('\n')}
}

var ClickUpgrades = []ClickUpgrade{
${clickUpgrades.map((u) => `\t{ID: ${goStr(u.id)}, Name: ${goStr(u.name)}, Desc: ${goStr(u.desc)}, BaseCost: ${goNum(u.baseCost)}, Scale: ${goNum(u.scale)}, Max: ${goInt(u.max)}, Effect: ${goEffect(u.effect)}, PerText: ${goStr(u.perText)}},`).join('\n')}
}

var Eras = []Era{
${eras.map((e) => `\t{ID: ${goInt(e.id)}, Name: ${goStr(e.name)}, En: ${goStr(e.en)}, Flavor: ${goStr(e.flavor)}},`).join('\n')}
}

var Researches = []Research{
${researches.map((r) => `\t{ID: ${goStr(r.id)}, Name: ${goStr(r.name)}, Desc: ${goStr(r.desc)}, Quote: ${goStr(r.quote)}, Era: ${goInt(r.era)}, Cost: ${goCost(r.cost)}, Req: ${goStrs(r.req)}, Effects: []Effect{${(r.effects || []).map(goEffect).join(', ')}}},`).join('\n')}
}

var Routes = []Route{
${routes.map((r) => `\t{ID: ${goStr(r.id)}, Name: ${goStr(r.name)}, Title: ${goStr(r.title)}, En: ${goStr(r.en)}, Desc: ${goStr(r.desc)}, Perks: ${goStrs(r.perks)}, SpecialName: ${goStr(r.specialName)}, SpecialEn: ${goStr(r.specialEn)}, RequireResearch: ${goStr(r.requireResearch)}},`).join('\n')}
}

var RouteUpgrades = []RouteUpgrade{
${routeUpgrades.map((u) => `\t{ID: ${goStr(u.id)}, Route: ${goStr(u.route)}, Name: ${goStr(u.name)}, Desc: ${goStr(u.desc)}, Max: ${goInt(u.max)}, BaseCost: ${goNum(u.baseCost)}, Scale: ${goNum(u.scale)}, Effect: ${goEffect(u.effect)}},`).join('\n')}
}

var CoreUpgrades = []CoreUpgrade{
${coreUpgrades.map((u) => `\t{ID: ${goStr(u.id)}, Name: ${goStr(u.name)}, Desc: ${goStr(u.desc)}, Max: ${goInt(u.max)}, Base: ${goNum(u.base)}, Inc: ${goNum(u.inc)}, EffectPer: ${goEffect(u.effectPer)}},`).join('\n')}
}

var StoryEvents = []StoryEvent{
${stories.map((s) => `\t{ID: ${goStr(s.id)}, RemainSec: ${goNum(s.remainSec)}, Text: ${goStr(s.text)}, Tone: ${goStr(s.tone)}},`).join('\n')}
}

var RandomEvents = []RandomEvent{
${randomEvents.map((e) => `\t{ID: ${goStr(e.id)}, Name: ${goStr(e.name)}, Text: ${goStr(e.text)}, Tone: ${goStr(e.tone)}, Kind: ${goStr(e.kind)}, Res: ${goStr(e.res)}, Seconds: ${goNum(e.seconds)}, DeadlineAdd: ${goNum(e.deadlineAdd)}, Weight: ${goNum(e.weight)}},`).join('\n')}
}

var ResMetas = []ResMeta{
${Object.entries(resMeta).map(([id, m]) => `\t{ID: ${goStr(id)}, Name: ${goStr(m.name)}, En: ${goStr(m.en)}, Color: ${goStr(m.color)}},`).join('\n')}
}

var LeaderboardNames = ${goStrs(leaderboardNames)}
`;
  fs.writeFileSync(path.join(goOutDir, 'tables_gen.go'), goCode, 'utf-8');
  console.log('[Luban] Wrote Go tables_gen.go (' + [buildings.length, clickUpgrades.length, researches.length, routeUpgrades.length, coreUpgrades.length].join('/') + ' rows)');

  console.log('[Luban] Wrote ' + path.join(serverDataDir, 'tables.json'));

  console.log('[Luban] Generation completed successfully!');
  console.log('[Luban] Summary:');
  console.log(`  - Global keys: ${Object.keys(globalMap).length}`);
  console.log(`  - Buildings: ${buildings.length}`);
  console.log(`  - ClickUpgrades: ${clickUpgrades.length}`);
  console.log(`  - Eras: ${eras.length}`);
  console.log(`  - Research: ${researches.length}`);
  console.log(`  - Routes: ${routes.length}`);
  console.log(`  - RouteUpgrades: ${routeUpgrades.length}`);
  console.log(`  - CoreUpgrades: ${coreUpgrades.length}`);
  console.log(`  - StoryEvents: ${stories.length}`);
  console.log(`  - RandomEvents: ${randomEvents.length}`);
}

try {
  main();
} catch (e) {
  console.error('[Luban] Fatal error:', e);
  process.exit(1);
}
