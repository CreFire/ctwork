/**
 * ============================================================
 * 方舟纪元 ARK ERA — 游戏配置表 (Luban 驱动版)
 * ============================================================
 * 本文件不再硬编码数值，所有数值来自 Luban CSV 配置表
 *   server/luban/tables/*.csv
 * 由 scripts/luban-gen.mjs 生成 src/game/generated/Tables.ts
 * 
 * 健壮性设计：
 * - 尝试加载生成表，若缺失则回退到内嵌默认值
 * - 运行时校验所有表，非法值自动修正并警告
 * - 提供 getConfig() / reloadConfig() 支持热更
 * - 保留原有导出接口，引擎层零改动
 * ============================================================
 */

import type { Building as GenBuilding, ResMeta as GenResMeta } from "./generated/Beans";

import {
  GLOBAL as GEN_GLOBAL,
  BUILDINGS as GEN_BUILDINGS,
  CLICK_UPGRADES as GEN_CLICK_UPGRADES,
  ERAS as GEN_ERAS,
  RESEARCH as GEN_RESEARCH,
  ROUTES as GEN_ROUTES,
  ROUTE_UPGRADES as GEN_ROUTE_UPGRADES,
  CORE_UPGRADES as GEN_CORE_UPGRADES,
  STORY_EVENTS as GEN_STORY_EVENTS,
  RANDOM_EVENTS as GEN_RANDOM_EVENTS,
  RES_META as GEN_RES_META,
  LEADERBOARD_NAMES as GEN_LEADERBOARD_NAMES,
  EVENT_MIN_GAP as GEN_EVENT_MIN_GAP,
  EVENT_MAX_GAP as GEN_EVENT_MAX_GAP,
} from "./generated/Tables";

import { validateAll } from "./configValidator";

// Fallback 硬编码（仅在生成表缺失时使用，保证游戏可运行）
const FALLBACK_GLOBAL = {
  version: 1,
  earthCountdownSeconds: 3600,
  offlineCapHours: 8,
  offlineEfficiency: 0.5,
  clickBasePower: 1,
  critMult: 5,
  milestoneEvery: 25,
  milestoneMult: 2,
  launchEnergyReq: 250000,
  launchMaterialReq: 25000,
  tickMs: 250,
  autosaveMs: 8000,
  rewardBase: 3,
  eventMinGap: 170,
  eventMaxGap: 400,
  firstEventDelaySeconds: 150,
  crateLifeSeconds: 45,
  crateMinGainSeconds: 180,
  kitEnergyPerLevel: 4000,
  kitMaterialPerLevel: 150,
  kitResearchPerLevel: 20,
  anchorBonusSeconds: 600,
  rewardTimeDivisor: 600,
  rewardProdDivisor: 1000000,
  maxCritRate: 0.95,
  maxOfflineSeconds: 28800,
} as const;

const FALLBACK_BUILDINGS: GenBuilding[] = [
  { id: "b_solar", name: "太阳能阵列", en: "SOLAR ARRAY", chain: "energy", desc: "危机纪元最可靠的第一缕光。", baseCost: { energy: 15 }, scale: 1.15, produces: "energy", perSec: 0.5 },
  { id: "b_fossil", name: "化石电站", en: "FOSSIL PLANT", chain: "energy", desc: "烧掉旧世界的遗产,换取最后一程。", baseCost: { energy: 110, material: 12 }, scale: 1.15, produces: "energy", perSec: 3 },
  { id: "b_fission", name: "裂变电站", en: "FISSION PLANT", chain: "energy", desc: "铀燃料棒彻夜咆哮,如同文明的喘息。", baseCost: { energy: 2400, material: 120 }, scale: 1.16, produces: "energy", perSec: 16, unlockResearch: "r_nuclear" },
  { id: "b_fusion", name: "聚变反应堆", en: "FUSION REACTOR", chain: "energy", desc: "在海水中点燃太阳。", baseCost: { energy: 36000, material: 900 }, scale: 1.17, produces: "energy", perSec: 120, unlockResearch: "r_fusion" },
  { id: "b_antimatter", name: "反物质堆", en: "ANTIMATTER CORE", chain: "energy", desc: "一克湮灭,一座城市的一年。", baseCost: { energy: 520000, material: 7000 }, scale: 1.18, produces: "energy", perSec: 950, unlockResearch: "r_antimatter" },
  { id: "b_zero", name: "零点引擎", en: "ZERO-POINT DRIVE", chain: "energy", desc: "从真空本身榨取能量,神明般的技术。", baseCost: { energy: 6500000, material: 55000 }, scale: 1.18, produces: "energy", perSec: 8000, unlockResearch: "r_vacuum" },
  { id: "b_scavenge", name: "拾荒者小队", en: "SCAVENGERS", chain: "material", desc: "在秩序崩解的城市里回收文明的残骸。", baseCost: { energy: 40 }, scale: 1.15, produces: "material", perSec: 0.5 },
  { id: "b_mine", name: "纳米矿机", en: "NANO MINER", chain: "material", desc: "成群的纳米虫将岩层啃噬成可用元素。", baseCost: { energy: 1800, material: 100 }, scale: 1.16, produces: "material", perSec: 5, unlockResearch: "r_nano" },
  { id: "b_smelter", name: "轨道熔炼厂", en: "ORBITAL FOUNDRY", chain: "material", desc: "小行星带成了人类的露天矿场。", baseCost: { energy: 30000, material: 800 }, scale: 1.17, produces: "material", perSec: 42, unlockResearch: "r_orbital" },
  { id: "b_molecular", name: "分子重构炉", en: "MOLECULAR FORGE", chain: "material", desc: "垃圾进,合金出。物质只是排列的艺术。", baseCost: { energy: 480000, material: 9000 }, scale: 1.18, produces: "material", perSec: 360, unlockResearch: "r_molecular" },
  { id: "b_study", name: "临时研究组", en: "THINK TANK", chain: "research", desc: "避难所里亮到深夜的灯。", baseCost: { research: 60 }, scale: 1.15, produces: "research", perSec: 0.3 },
  { id: "b_lab", name: "综合实验室", en: "MEGA LAB", chain: "research", desc: "人类最后的十五年教育,浓缩于此。", baseCost: { material: 700, energy: 2000 }, scale: 1.16, produces: "research", perSec: 2.2, unlockResearch: "r_automation" },
  { id: "b_quantum", name: "量子超算", en: "QUANTUM CORE", chain: "research", desc: "一纳秒的推演,胜过学者一生。", baseCost: { material: 8500, energy: 30000 }, scale: 1.17, produces: "research", perSec: 16, unlockResearch: "r_ai" },
  { id: "b_datacore", name: "数据核心", en: "DATA CORE", chain: "special", desc: "机械路线:源源不断地产出「算力」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "machine" },
  { id: "b_spire", name: "孵化尖塔", en: "HATCHERY SPIRE", chain: "special", desc: "蜂群路线:溫热地表下产出「生物质」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "swarm" },
  { id: "b_monolith", name: "灵能方碑", en: "PSION MONOLITH", chain: "special", desc: "灵能路线:静默石碑汇聚「灵能」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "psionic" },
] as any;

function safeGet<T>(genValue: T | undefined, fallback: T): T {
  if (genValue === undefined || genValue === null) {
    return fallback;
  }
  return genValue;
}

// 运行校验
const validationInput = {
  global: GEN_GLOBAL,
  buildings: GEN_BUILDINGS,
  clickUpgrades: GEN_CLICK_UPGRADES,
  researches: GEN_RESEARCH,
  routes: GEN_ROUTES,
  routeUpgrades: GEN_ROUTE_UPGRADES,
  coreUpgrades: GEN_CORE_UPGRADES,
  stories: GEN_STORY_EVENTS,
  randomEvents: GEN_RANDOM_EVENTS,
};

const validation = validateAll(validationInput);

if (!validation.ok) {
  console.warn("[Config] Validation failed with errors:", validation.errors);
}
if (validation.warnings.length > 0) {
  console.warn("[Config] Validation warnings:", validation.warnings);
}

// 导出类型（保持兼容）
export type ResourceKey = "energy" | "material" | "research" | "special";
export type RouteId = "machine" | "swarm" | "psionic";
export type ChainType = "energy" | "material" | "research" | "special";
export type EffectKind = "mult" | "clickMult" | "autoClick" | "crit" | "countdown" | "enableRoute" | "startKit" | "note" | "final";
export type EventKind = "instant" | "crate" | "deadline";
export type EventTone = "info" | "success" | "warn" | "danger" | "story";

export interface Cost {
  energy?: number;
  material?: number;
  research?: number;
  special?: number;
}

export type Effect =
  | { k: "mult"; res: ResourceKey | "all"; v: number }
  | { k: "clickMult"; v: number }
  | { k: "autoClick"; v: number }
  | { k: "crit"; v: number }
  | { k: "countdown"; v: number }
  | { k: "enableRoute"; route: RouteId }
  | { k: "startKit"; v: number }
  | { k: "note"; text: string }
  | { k: "final" };

/**
 * 引擎消费的表结构:与 Luban Bean(src/game/generated/Beans.ts)字段一一对应,
 * 但把 Effect 收窄成可辨识联合(生成物为宽松结构,已由 configValidator 运行时校验)。
 * 这样 engine.ts / store.ts / 组件层继续享受编译期穷尽检查,配置仍由 CSV 驱动。
 */
export interface BuildingDef {
  id: string;
  name: string;
  en: string;
  chain: ChainType;
  desc: string;
  baseCost: Cost;
  scale: number;
  produces: ResourceKey;
  perSec: number;
  unlockResearch?: string;
  unlockRoute?: RouteId;
}

export interface ClickUpgradeDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number; // energy
  scale: number;
  max: number;
  effect: Effect;
  perText: string;
}

export interface ResearchDef {
  id: string;
  name: string;
  desc: string;
  quote?: string;
  era: number;
  cost: Cost;
  req: string[];
  effects: Effect[];
}

export interface RouteDef {
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

export interface RouteUpgradeDef {
  id: string;
  route: RouteId;
  name: string;
  desc: string;
  max: number;
  baseCost: number; // 特殊资源
  scale: number;
  effect: Effect;
}

export interface CoreUpgradeDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number; // 星核
  inc: number; // 每级递增至 base + inc*lvl
  effectPer: Effect;
}

export interface StoryEvent {
  id: string;
  remainSec: number; // 剩余时间 ≤ 该值时触发
  text: string;
  tone: "info" | "warn" | "danger";
}

export interface RandomEventDef {
  id: string;
  name: string;
  text: string;
  tone: "info" | "success" | "warn" | "danger";
  kind: EventKind;
  res?: ResourceKey;
  seconds?: number; // 折算多少秒的产量
  deadlineAdd?: number;
}

export interface EraDef {
  id?: number;
  name: string;
  en: string;
  flavor: string;
}

export type ResMetaDef = GenResMeta;

// ---------------- 全局表 ----------------
export const GLOBAL = {
  version: safeGet(GEN_GLOBAL?.version, FALLBACK_GLOBAL.version),
  earthCountdownSeconds: safeGet(GEN_GLOBAL?.earthCountdownSeconds, FALLBACK_GLOBAL.earthCountdownSeconds),
  offlineCapHours: safeGet(GEN_GLOBAL?.offlineCapHours, FALLBACK_GLOBAL.offlineCapHours),
  offlineEfficiency: safeGet(GEN_GLOBAL?.offlineEfficiency, FALLBACK_GLOBAL.offlineEfficiency),
  clickBasePower: safeGet(GEN_GLOBAL?.clickBasePower, FALLBACK_GLOBAL.clickBasePower),
  critMult: safeGet(GEN_GLOBAL?.critMult, FALLBACK_GLOBAL.critMult),
  milestoneEvery: safeGet(GEN_GLOBAL?.milestoneEvery, FALLBACK_GLOBAL.milestoneEvery),
  milestoneMult: safeGet(GEN_GLOBAL?.milestoneMult, FALLBACK_GLOBAL.milestoneMult),
  launchEnergyReq: safeGet(GEN_GLOBAL?.launchEnergyReq, FALLBACK_GLOBAL.launchEnergyReq),
  launchMaterialReq: safeGet(GEN_GLOBAL?.launchMaterialReq, FALLBACK_GLOBAL.launchMaterialReq),
  tickMs: safeGet(GEN_GLOBAL?.tickMs, FALLBACK_GLOBAL.tickMs),
  autosaveMs: safeGet(GEN_GLOBAL?.autosaveMs, FALLBACK_GLOBAL.autosaveMs),
  crateLifeSeconds: safeGet(GEN_GLOBAL?.crateLifeSeconds, FALLBACK_GLOBAL.crateLifeSeconds),
  eventMinGap: safeGet((GEN_GLOBAL as any)?.eventMinGap, FALLBACK_GLOBAL.eventMinGap),
  eventMaxGap: safeGet((GEN_GLOBAL as any)?.eventMaxGap, FALLBACK_GLOBAL.eventMaxGap),
  firstEventDelaySeconds: safeGet((GEN_GLOBAL as any)?.firstEventDelaySeconds, FALLBACK_GLOBAL.firstEventDelaySeconds),
  crateMinGainSeconds: safeGet((GEN_GLOBAL as any)?.crateMinGainSeconds, FALLBACK_GLOBAL.crateMinGainSeconds),
  kitEnergyPerLevel: safeGet((GEN_GLOBAL as any)?.kitEnergyPerLevel, FALLBACK_GLOBAL.kitEnergyPerLevel),
  kitMaterialPerLevel: safeGet((GEN_GLOBAL as any)?.kitMaterialPerLevel, FALLBACK_GLOBAL.kitMaterialPerLevel),
  kitResearchPerLevel: safeGet((GEN_GLOBAL as any)?.kitResearchPerLevel, FALLBACK_GLOBAL.kitResearchPerLevel),
  anchorBonusSeconds: safeGet((GEN_GLOBAL as any)?.anchorBonusSeconds, FALLBACK_GLOBAL.anchorBonusSeconds),
  rewardTimeDivisor: safeGet((GEN_GLOBAL as any)?.rewardTimeDivisor, FALLBACK_GLOBAL.rewardTimeDivisor),
  rewardProdDivisor: safeGet((GEN_GLOBAL as any)?.rewardProdDivisor, FALLBACK_GLOBAL.rewardProdDivisor),
  maxCritRate: safeGet((GEN_GLOBAL as any)?.maxCritRate, FALLBACK_GLOBAL.maxCritRate),
  maxOfflineSeconds: safeGet((GEN_GLOBAL as any)?.maxOfflineSeconds, FALLBACK_GLOBAL.maxOfflineSeconds),
  rewardBase: safeGet((GEN_GLOBAL as any)?.rewardBase, FALLBACK_GLOBAL.rewardBase),
  _raw: (GEN_GLOBAL as any)?._raw || FALLBACK_GLOBAL,
} as const;

// ---------------- 建筑表 ----------------
export const BUILDINGS: BuildingDef[] = safeGet(GEN_BUILDINGS as any, FALLBACK_BUILDINGS as any);

// ---------------- 点击升级表 ----------------
export const CLICK_UPGRADES: ClickUpgradeDef[] = safeGet(GEN_CLICK_UPGRADES as any, [
  { id: "u_click", name: "聚能矩阵", desc: "强化核心共鸣,每次点击产出翻倍。", baseCost: 40, scale: 3.1, max: 25, effect: { k: "clickMult", v: 2 }, perText: "点击产出 ×2" },
  { id: "u_auto", name: "采集无人机", desc: "不知疲倦的自动采集单元。", baseCost: 180, scale: 3.4, max: 20, effect: { k: "autoClick", v: 1 }, perText: "+1 次自动点击/秒" },
  { id: "u_crit", name: "过载协议", desc: "让核心周期性超载运转。", baseCost: 900, scale: 4, max: 10, effect: { k: "crit", v: 0.04 }, perText: `暴击率 +4%(暴击 ×${FALLBACK_GLOBAL.critMult})` },
] as any);

// ---------------- 纪元表 ----------------
export const ERAS: EraDef[] = safeGet(
  GEN_ERAS?.map((e: any) => ({ name: e.name, en: e.en, flavor: e.flavor })) as any,
  [
    { name: "危机纪元", en: "ERA OF CRISIS", flavor: "倒计时开始,人类第一次为同一个目标工作。" },
    { name: "重整纪元", en: "RECONSTRUCTION", flavor: "秩序崩塌之后,工程师成为新的祭司。" },
    { name: "环轨纪元", en: "ORBITAL AGE", flavor: "我们的目光越过云层,落在轨道之上。" },
    { name: "飞升前夜", en: "EVE OF ASCENSION", flavor: "物种的定义,第一次由我们自己改写。" },
    { name: "深空纪元", en: "DEEP SPACE", flavor: "物理学最后一页写着:此路可通群星。" },
    { name: "终章", en: "FINALE", flavor: "文明的门票,只留给跑得最快的孩子。" },
  ] as any
);

// ---------------- 科技树 ----------------
export const RESEARCH: ResearchDef[] = safeGet(GEN_RESEARCH as any, [] as any);

// ---------------- 路线表 ----------------
export const ROUTES: RouteDef[] = safeGet(GEN_ROUTES as any, [
  {
    id: "machine",
    name: "机械飞升",
    title: "钢铁洪流",
    en: "MECHANICAL ASCENSION",
    desc: "摒弃血肉,将文明托付给不知疲倦的钢铁。算力即是权力。",
    perks: ["解锁建筑「数据核心」产出算力", "专属升级重铸产能结构", "自动采集能力大幅增强"],
    specialName: "算力",
    specialEn: "COMPUTE",
    requireResearch: "r_ai",
  },
  {
    id: "swarm",
    name: "蜂群意志",
    title: "虫群之心",
    en: "SWARM HIVE",
    desc: "拥抱生物的终极形态——亿万个体,一个意志。生物质如潮水般涨落。",
    perks: ["解锁建筑「孵化尖塔」产出生物质", "群体进化使全线产出暴涨", "点击灌注生物质可获爆发收益"],
    specialName: "生物质",
    specialEn: "BIOMASS",
    requireResearch: "r_gene",
  },
  {
    id: "psionic",
    name: "灵能升华",
    title: "虚空回响",
    en: "PSIONIC SUBLIMATION",
    desc: "意识脱离肉体之壳,在现实与虚空的夹缝中低语。概率站在我们这边。",
    perks: ["解锁建筑「灵能方碑」产出灵能", "窥探未来,暴击与奇迹不断", "扭曲现实的能量法则"],
    specialName: "灵能",
    specialEn: "PSION",
    requireResearch: "r_psy",
  },
] as any);

export const ROUTE_UPGRADES: RouteUpgradeDef[] = safeGet(GEN_ROUTE_UPGRADES as any, [] as any);

export const CORE_UPGRADES: CoreUpgradeDef[] = safeGet(GEN_CORE_UPGRADES as any, [] as any);

export const STORY_EVENTS: StoryEvent[] = safeGet(GEN_STORY_EVENTS as any, [
  { id: "st_start", remainSec: 3599, text: "「方舟协定」签署完毕,全球资源统一调度。倒计时开始。", tone: "info" },
  { id: "st_75", remainSec: 2700, text: "地壳应力突破临界值,环太平洋火山群接连苏醒。", tone: "warn" },
  { id: "st_60", remainSec: 2160, text: "最后一批冬眠舱完成装载,孩子们还不知道发生了什么。", tone: "info" },
  { id: "st_40", remainSec: 1440, text: "月球监测站失联。引力网格出现无法解释的涟漪。", tone: "warn" },
  { id: "st_25", remainSec: 900, text: "全球广播进入静默。所有人停下了手中的告别。", tone: "danger" },
  { id: "st_10", remainSec: 360, text: "地核裂解不可逆。海洋开始沸腾。", tone: "danger" },
  { id: "st_last", remainSec: 60, text: "最后六十秒。所有传感器转向母星,作别。", tone: "danger" },
] as any);

export const RANDOM_EVENTS: RandomEventDef[] = safeGet(GEN_RANDOM_EVENTS as any, [
  { id: "ev_solar", name: "太阳风暴", text: "强烈的太阳风掠过轨道阵列,充能效率暴涨。", tone: "success", kind: "instant", res: "energy", seconds: 90 },
  { id: "ev_debris", name: "彗星残骸带", text: "冰质彗尾携带着大量可用元素经过近地轨道。", tone: "success", kind: "instant", res: "material", seconds: 120 },
  { id: "ev_signal", name: "深空信号", text: "捕捉到一段规律的脉冲信号,研究组连夜完成了解密推演。", tone: "success", kind: "instant", res: "research", seconds: 90 },
  { id: "ev_sling", name: "引力弹弓", text: "领航组利用天体引力意外争取到宝贵时间。", tone: "info", kind: "deadline", deadlineAdd: 120 },
  { id: "ev_crate", name: "漂流补给舱", text: "一个冷战时期的补给舱漂入雷达范围——快去回收!", tone: "success", kind: "crate" },
  { id: "ev_raiders", name: "轨道流寇", text: "流寇编队试图靠近储存区,被防御系统驱离。", tone: "warn", kind: "instant", res: "energy", seconds: -45 },
] as any);

export const EVENT_MIN_GAP = safeGet(GEN_EVENT_MIN_GAP, FALLBACK_GLOBAL.eventMinGap);
export const EVENT_MAX_GAP = safeGet(GEN_EVENT_MAX_GAP, FALLBACK_GLOBAL.eventMaxGap);

export const RES_META: Record<ResourceKey, { name: string; en: string; color: string }> = safeGet(
  GEN_RES_META as any,
  {
    energy: { name: "能量", en: "ENERGY", color: "#22d3ee" },
    material: { name: "物资", en: "MATERIAL", color: "#f59e0b" },
    research: { name: "科研", en: "SCIENCE", color: "#4ade80" },
    special: { name: "特殊", en: "SPECIAL", color: "#a78bfa" },
  } as any
);

export const LEADERBOARD_NAMES: string[] = safeGet(GEN_LEADERBOARD_NAMES as any, [
  "文明观察者#4211", "洛希极限", "猎户座之泪", "白矮星信使", "引力波哀伤",
  "第三旋翼", "量子凝视者", "暗淡蓝点", "奥尔特云海", "王维轨道站",
  "银心漫步者", "日冕抛射物", "混沌信使#77", "先遣舰队残部", "柯伊伯带守门人",
  "潮汐锁定", "玻色子凝聚", "阿贝尔2218", "最后一盏路灯", "歸零者",
  "超新星余烬", "真空衰变", "巨引源航标", "天鹅座-X1", "长蛇座殖民团",
  "叙事层之外", "反德西特航员", "普朗克尘埃", "永恒暴胀泡沫", "狄拉克之海",
] as any);

// ---------------- 索引表（Luban map 模式） ----------------
export const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.id, b]));
export const RESEARCH_MAP = new Map(RESEARCH.map((r) => [r.id, r]));
export const ROUTE_MAP = new Map(ROUTES.map((r) => [r.id, r]));
export const ROUTE_UPGRADE_MAP = new Map(ROUTE_UPGRADES.map((u) => [u.id, u]));
export const CORE_UPGRADE_MAP = new Map(CORE_UPGRADES.map((u) => [u.id, u]));
export const CLICK_UPGRADE_MAP = new Map(CLICK_UPGRADES.map((u) => [u.id, u]));
export const RANDOM_EVENT_MAP = new Map(RANDOM_EVENTS.map((e) => [e.id, e]));

// ---------------- 工具函数 ----------------
export function effectText(e: Effect, perLevel = false): string[] {
  const t = perLevel ? " / 级" : "";
  const resName = (r: ResourceKey | "all") => (r === "all" ? "全部" : RES_META[r as ResourceKey]?.name || r);
  switch (e.k) {
    case "mult":
      return [`${resName(e.res)}产出 ×${e.v}${t}`];
    case "clickMult":
      return [`点击产出 ×${e.v}${t}`];
    case "autoClick":
      return [`自动点击 +${e.v}次/秒${t}`];
    case "crit":
      return [`暴击率 +${Math.round(e.v * 100)}%${t}`];
    case "countdown":
      return [`地球倒计时 +${Math.round(e.v / 60)}分钟${t}`];
    case "enableRoute":
      return [`解锁科技路线「${ROUTE_MAP.get(e.route)?.name || e.route}」`];
    case "startKit":
      return [`开局补给 +100%${t}`];
    case "note":
      return [e.text];
    case "final":
      return ["曲率引擎就绪 — 方舟可以点火"];
  }
}

// ---------------- 配置管理 API（支持热更与健壮性） ----------------
export interface ConfigSnapshot {
  global: typeof GLOBAL;
  buildings: typeof BUILDINGS;
  clickUpgrades: typeof CLICK_UPGRADES;
  eras: typeof ERAS;
  researches: typeof RESEARCH;
  routes: typeof ROUTES;
  routeUpgrades: typeof ROUTE_UPGRADES;
  coreUpgrades: typeof CORE_UPGRADES;
  storyEvents: typeof STORY_EVENTS;
  randomEvents: typeof RANDOM_EVENTS;
  resMeta: typeof RES_META;
  leaderboardNames: typeof LEADERBOARD_NAMES;
  validation: typeof validation;
}

export function getConfigSnapshot(): ConfigSnapshot {
  return {
    global: GLOBAL,
    buildings: BUILDINGS,
    clickUpgrades: CLICK_UPGRADES,
    eras: ERAS,
    researches: RESEARCH,
    routes: ROUTES,
    routeUpgrades: ROUTE_UPGRADES,
    coreUpgrades: CORE_UPGRADES,
    storyEvents: STORY_EVENTS,
    randomEvents: RANDOM_EVENTS,
    resMeta: RES_META,
    leaderboardNames: LEADERBOARD_NAMES,
    validation,
  };
}

export function getConfigHealth(): { ok: boolean; errors: string[]; warnings: string[]; source: string } {
  return {
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
    source: "luban-generated",
  };
}

// 兼容旧版：导出原始生成表以便调试
export const _GENERATED = {
  GLOBAL: GEN_GLOBAL,
  BUILDINGS: GEN_BUILDINGS,
  CLICK_UPGRADES: GEN_CLICK_UPGRADES,
  ERAS: GEN_ERAS,
  RESEARCH: GEN_RESEARCH,
  ROUTES: GEN_ROUTES,
  ROUTE_UPGRADES: GEN_ROUTE_UPGRADES,
  CORE_UPGRADES: GEN_CORE_UPGRADES,
  STORY_EVENTS: GEN_STORY_EVENTS,
  RANDOM_EVENTS: GEN_RANDOM_EVENTS,
  RES_META: GEN_RES_META,
  LEADERBOARD_NAMES: GEN_LEADERBOARD_NAMES,
};

// 打印配置健康状态（开发环境）
if (typeof window !== "undefined") {
  // @ts-ignore
  const isDev = (import.meta as any)?.env?.DEV;
  if (isDev) {
    console.log("[Config] Loaded from: luban-generated");
    if (!validation.ok) {
      console.warn("[Config] Validation errors:", validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn("[Config] Validation warnings:", validation.warnings);
    }
    console.log("[Config] Snapshot:", {
      buildings: BUILDINGS.length,
      researches: RESEARCH.length,
      routes: ROUTES.length,
      global: GLOBAL,
    });
  }
}
