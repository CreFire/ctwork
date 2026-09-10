/**
 * 方舟纪元 — 纯逻辑引擎层(与后端 Go 实现保持同一套公式)
 * 所有函数无副作用地操作传入的 SaveState 草案,由 store 层调度。
 */
import {
  BUILDINGS,
  BUILDING_MAP,
  CLICK_UPGRADES,
  CORE_UPGRADES,
  GLOBAL,
  RESEARCH,
  ROUTE_UPGRADES,
  type BuildingDef,
  type Cost,
  type ResourceKey,
  type RouteId,
} from "./config";

/* ================= 存档结构 ================= */

export interface RunState {
  runId: number;
  startedAt: number; // ms
  deadlineAt: number; // ms 地球解体时刻
  res: Record<ResourceKey, number>;
  route: RouteId | null;
  buildings: Record<string, number>;
  research: Record<string, boolean>;
  clickUp: Record<string, number>;
  routeUp: Record<string, number>;
  firedStories: string[];
  nextEventAt: number; // ms
  stats: { energyTotal: number; clicks: number };
}

/** 单次轮回的编年史记录(escaped=false 时即为「文明墓碑」) */
export interface RunRecord {
  runId: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  escaped: boolean;
  route: RouteId | null;
  era: number; // 抵达的纪元(已研究科技的最大 era)
  researchCount: number;
  buildingsTotal: number;
  energyTotal: number;
  clicks: number;
  cores: number; // 本次结算星核
  remainSec: number; // 结算时刻剩余倒计时
  epitaph: string; // 墓志铭(仅毁灭时)
}

export const MAX_HISTORY = 40; // 编年史容量(新纪录在前,超出截断)

export interface MetaState {
  cores: number; // 星核
  coreUp: Record<string, number>;
  runs: number;
  escapes: number;
  deaths: number;
  bestRemainSec: number;
  totalEnergy: number;
  totalClicks: number;
  history: RunRecord[]; // 文明编年史
}

export interface SaveState {
  version: number;
  uid: string;
  createdAt: number;
  lastTickAt: number;
  run: RunState;
  meta: MetaState;
}

/* ================= 派生属性 ================= */

export interface Derived {
  rates: Record<ResourceKey, number>; // 最终每秒产出
  baseRates: Record<ResourceKey, number>; // 建筑裸产出(含里程碑)
  mults: Record<ResourceKey, number>; // 最终乘区
  srcMult: Record<"research" | "route" | "core" | "all", Record<ResourceKey, number>>;
  clickPower: number;
  autoClicks: number; // 每秒自动点击次数
  autoRate: number; // 自动点击带来的能量/秒
  crit: number; // 暴击率
}

const RES_KEYS: ResourceKey[] = ["energy", "material", "research", "special"];

function emptyRes(v = 0): Record<ResourceKey, number> {
  return { energy: v, material: v, research: v, special: v };
}

/** 计算全部派生属性(产物速率 / 点击 / 暴击) */
export function computeDerived(save: SaveState): Derived {
  const { run, meta } = save;

  // 1) 建筑基础产出(含里程碑)
  const base = emptyRes();
  for (const def of BUILDINGS) {
    const count = run.buildings[def.id] ?? 0;
    if (!count) continue;
    if (def.produces === "special" && run.route !== def.unlockRoute) continue;
    const milestones = Math.floor(count / GLOBAL.milestoneEvery);
    const mm = Math.pow(GLOBAL.milestoneMult, milestones);
    base[def.produces] += count * def.perSec * mm;
  }

  // 2) 各来源乘区
  const src: Derived["srcMult"] = { research: emptyRes(1), route: emptyRes(1), core: emptyRes(1), all: emptyRes(1) };
  const acc = { mults: emptyRes(1), all: 1, clickMult: 1, autoClick: 0, crit: 0 };

  // 科技
  for (const def of RESEARCH) {
    if (!run.research[def.id]) continue;
    for (const e of def.effects) {
      if (e.k === "mult") {
        if (e.res === "all") for (const k of RES_KEYS) src.research[k] *= e.v;
        else src.research[e.res] *= e.v;
      }
    }
  }
  // 点击升级
  let clickUpMult = 1;
  for (const def of CLICK_UPGRADES) {
    const lvl = run.clickUp[def.id] ?? 0;
    if (!lvl) continue;
    if (def.effect.k === "clickMult") clickUpMult *= Math.pow(def.effect.v, lvl);
    if (def.effect.k === "autoClick") acc.autoClick += def.effect.v * lvl;
    if (def.effect.k === "crit") acc.crit += def.effect.v * lvl;
  }
  // 路线升级
  for (const def of ROUTE_UPGRADES) {
    const lvl = run.routeUp[def.id] ?? 0;
    if (!lvl) continue;
    if (def.route !== run.route) continue;
    const e = def.effect;
    if (e.k === "mult") {
      if (e.res === "all") for (const k of RES_KEYS) src.route[k] *= Math.pow(e.v, lvl);
      else src.route[e.res] *= Math.pow(e.v, lvl);
    } else if (e.k === "clickMult") clickUpMult *= Math.pow(e.v, lvl);
    else if (e.k === "autoClick") acc.autoClick += e.v * lvl;
    else if (e.k === "crit") acc.crit += e.v * lvl;
  }
  // 星核遗产
  for (const def of CORE_UPGRADES) {
    const lvl = meta.coreUp[def.id] ?? 0;
    if (!lvl) continue;
    const e = def.effectPer;
    if (e.k === "mult") {
      const v = Math.pow(e.v, lvl);
      if (e.res === "all") for (const k of RES_KEYS) src.core[k] *= v;
      else src.core[e.res] *= v;
    }
  }

  // 3) 汇总
  const finalMult = emptyRes(1);
  for (const k of RES_KEYS) finalMult[k] = src.research[k] * src.route[k] * src.core[k];
  const rates = emptyRes();
  for (const k of RES_KEYS) rates[k] = base[k] * finalMult[k];

  const clickPower = GLOBAL.clickBasePower * clickUpMult;
  const autoRate = acc.autoClick * clickPower;

  return {
    rates,
    baseRates: base,
    mults: finalMult,
    srcMult: src,
    clickPower,
    autoClicks: acc.autoClick,
    autoRate,
    crit: Math.min(acc.crit, GLOBAL.maxCritRate ?? 0.95),
  };
}

/* ================= 成本与购买 ================= */

export function scaleCost(base: Cost, scale: number, owned: number): Cost {
  const mult = Math.pow(scale, owned);
  const c: Cost = {};
  if (base.energy) c.energy = Math.ceil(base.energy * mult);
  if (base.material) c.material = Math.ceil(base.material * mult);
  if (base.research) c.research = Math.ceil(base.research * mult);
  if (base.special) c.special = Math.ceil(base.special * mult);
  return c;
}

export function specialCost(base: number, scale: number, lvl: number): number {
  return Math.ceil(base * Math.pow(scale, lvl));
}

export function coreCost(base: number, inc: number, lvl: number): number {
  return base + inc * lvl;
}

export function canAfford(save: SaveState, cost: Cost): boolean {
  const r = save.run.res;
  if (cost.energy && r.energy < cost.energy) return false;
  if (cost.material && r.material < cost.material) return false;
  if (cost.research && r.research < cost.research) return false;
  if (cost.special && r.special < cost.special) return false;
  return true;
}

export function payCost(save: SaveState, cost: Cost): void {
  const r = save.run.res;
  if (cost.energy) r.energy -= cost.energy;
  if (cost.material) r.material -= cost.material;
  if (cost.research) r.research -= cost.research;
  if (cost.special) r.special -= cost.special;
}

export function isBuildingUnlocked(def: BuildingDef, save: SaveState): boolean {
  if (def.unlockRoute) return save.run.route === def.unlockRoute;
  if (def.unlockResearch) return !!save.run.research[def.unlockResearch];
  return true;
}

export function researchAvailable(id: string, save: SaveState): "done" | "open" | "locked" {
  const run = save.run;
  if (run.research[id]) return "done";
  const def = RESEARCH.find((r) => r.id === id);
  if (!def) return "locked";
  return def.req.every((q) => run.research[q]) ? "open" : "locked";
}

/* ================= 存档生命周期 ================= */

export function newMeta(): MetaState {
  return { cores: 0, coreUp: {}, runs: 0, escapes: 0, deaths: 0, bestRemainSec: 0, totalEnergy: 0, totalClicks: 0, history: [] };
}

export function countdownBonus(meta: MetaState): number {
  const lvl = meta.coreUp["cu_anchor"] ?? 0;
  // 数值来自 tb_global.csv anchor_bonus_seconds
  return lvl * (GLOBAL.anchorBonusSeconds ?? 600);
}

export function newRun(runId: number, meta: MetaState, now: number): RunState {
  const duration = GLOBAL.earthCountdownSeconds + countdownBonus(meta);
  const res = emptyRes();
  const kit = meta.coreUp["cu_seeder"] ?? 0;
  if (kit > 0) {
    // 开局补给来自 tb_global.csv
    res.energy = (GLOBAL.kitEnergyPerLevel ?? 4000) * kit;
    res.material = (GLOBAL.kitMaterialPerLevel ?? 150) * kit;
    res.research = (GLOBAL.kitResearchPerLevel ?? 20) * kit;
  }
  return {
    runId,
    startedAt: now,
    deadlineAt: now + duration * 1000,
    res,
    route: null,
    buildings: {},
    research: {},
    clickUp: {},
    routeUp: {},
    firedStories: [],
    // 初始事件间隔来自全局配置，默认 150s
    nextEventAt: now + (GLOBAL.eventMinGap ?? 150) * 1000 * 0.9,
    stats: { energyTotal: 0, clicks: 0 },
  };
}

export function newSave(uid: string, now: number): SaveState {
  const meta = newMeta();
  return { version: GLOBAL.version, uid, createdAt: now, lastTickAt: now, run: newRun(1, meta, now), meta };
}

/* ================= 生产结算 ================= */

export function applyTick(save: SaveState, d: Derived, dtSec: number): void {
  const r = save.run.res;
  r.energy += d.rates.energy * dtSec + d.autoRate * dtSec;
  r.material += d.rates.material * dtSec;
  r.research += d.rates.research * dtSec;
  r.special += d.rates.special * dtSec;
  const earned = d.rates.energy * dtSec + d.autoRate * dtSec;
  save.run.stats.energyTotal += earned;
  save.meta.totalEnergy += earned;
}

export interface OfflineResult {
  seconds: number;
  gains: Record<ResourceKey, number>;
  died: boolean;
}

/** 离线结算:收益按上限与截止时间取小,若已超过截止时间则判定母星已毁 */
export function applyOffline(save: SaveState, now: number): OfflineResult {
  const d = computeDerived(save);
  const last = save.lastTickAt;
  const cap = GLOBAL.offlineCapHours * 3600;
  const deadlineSec = save.run.deadlineAt / 1000;
  const lastSec = last / 1000;
  const prodSec = Math.max(0, Math.min(now / 1000, deadlineSec) - lastSec);
  const seconds = Math.min(prodSec, cap);
  const gains = emptyRes();
  const eff = GLOBAL.offlineEfficiency;
  for (const k of RES_KEYS) gains[k] = d.rates[k] * seconds * eff;
  gains.energy += d.autoRate * seconds * eff;
  const r = save.run.res;
  for (const k of RES_KEYS) r[k] += gains[k];
  save.run.stats.energyTotal += gains.energy;
  save.meta.totalEnergy += gains.energy;
  save.lastTickAt = now;
  return { seconds, gains, died: now >= save.run.deadlineAt };
}

/* ================= 发射与轮回 ================= */

export function launchReady(save: SaveState): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!save.run.research["r_engine"]) missing.push("研究「曲率引擎」");
  if (save.run.res.energy < GLOBAL.launchEnergyReq) missing.push(`储备能量 ${GLOBAL.launchEnergyReq.toLocaleString()}`);
  if (save.run.res.material < GLOBAL.launchMaterialReq) missing.push(`储备物资 ${GLOBAL.launchMaterialReq.toLocaleString()}`);
  return { ok: missing.length === 0, missing };
}

export interface RewardBreakdown {
  base: number;
  production: number;
  time: number;
  total: number;
  escaped: boolean;
}

export function computeReward(save: SaveState, escaped: boolean, now: number): RewardBreakdown {
  const produced = Math.max(0, save.run.stats.energyTotal);
  const prodDivisor = GLOBAL.rewardProdDivisor ?? 1000000;
  const timeDivisor = GLOBAL.rewardTimeDivisor ?? 600;
  const prodPart = Math.floor(Math.sqrt(produced / prodDivisor));
  const remainSec = Math.max(0, (save.run.deadlineAt - now) / 1000);
  if (escaped) {
    const base = GLOBAL.rewardBase;
    const time = Math.floor(remainSec / timeDivisor);
    return { base, production: prodPart, time, total: base + prodPart + time, escaped: true };
  }
  const total = 1 + Math.floor(prodPart / 2);
  return { base: 1, production: Math.floor(prodPart / 2), time: 0, total, escaped: false };
}

/** 查找建筑定义 */
export function buildingDef(id: string): BuildingDef {
  const def = BUILDING_MAP.get(id);
  if (!def) throw new Error("unknown building " + id);
  return def;
}

/* ================= 文明编年史 · 墓碑 · 快照 ================= */

/** 当前已抵达的纪元(以已研究科技的最大 era 计) */
export function eraReachedOf(save: SaveState): number {
  let era = 0;
  for (const def of RESEARCH) {
    if (save.run.research[def.id]) era = Math.max(era, def.era);
  }
  return era;
}

/** 在轮回终点为文明立传(结算时刻对当前 run 状态的整体快照) */
export function makeRunRecord(save: SaveState, escaped: boolean, reward: RewardBreakdown, now: number): RunRecord {
  let buildingsTotal = 0;
  for (const n of Object.values(save.run.buildings)) buildingsTotal += n;
  let researchCount = 0;
  for (const id of Object.keys(save.run.research)) if (save.run.research[id]) researchCount++;
  return {
    runId: save.run.runId,
    startedAt: save.run.startedAt,
    endedAt: now,
    durationSec: Math.max(0, Math.round((now - save.run.startedAt) / 1000)),
    escaped,
    route: save.run.route,
    era: eraReachedOf(save),
    researchCount,
    buildingsTotal,
    energyTotal: Math.max(0, Math.floor(save.run.stats.energyTotal)),
    clicks: Math.floor(save.run.stats.clicks),
    cores: reward.total,
    remainSec: Math.max(0, Math.floor((save.run.deadlineAt - now) / 1000)),
    epitaph: "",
  };
}

/** 墓志铭池:以 runId 确定性选取,同一墓碑铭文恒定 */
const EPITAPHS = [
  "他们抬起了头,却没能等到离开的那天。",
  "倒计时走完了,勇气还剩最后一格。",
  "这颗星球埋葬了他们的城市,埋不掉他们的名字。",
  "火种熄灭于黎明之前,但黎明终究会来。",
  "他们把一切都算对了,除了时间。",
  "尘埃记得每一盏没能点亮的灯。",
  "没有方舟,他们便成为了星球本身。",
  "日志的最后一行:不要为我们哭泣。",
  "引力赢了这一局,而宇宙还很长。",
  "他们在自己的摇篮里睡去,梦见了群星。",
];

export function epitaphFor(record: RunRecord): string {
  let h = (record.runId + 1) * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  return EPITAPHS[h % EPITAPHS.length];
}

/** 落笔编年史(新纪录在前,容量截断) */
export function pushHistory(meta: MetaState, rec: RunRecord): void {
  if (!meta.history) meta.history = [];
  meta.history.unshift(rec);
  if (meta.history.length > MAX_HISTORY) meta.history.length = MAX_HISTORY;
}
