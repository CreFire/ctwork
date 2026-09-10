/**
 * ============================================================
 * 方舟纪元 ARK ERA — 游戏配置表
 * ============================================================
 * 本文件结构与 Luban 配置方案一一对应:
 *   - 每张表 = 一个 Luban 数据表(tb_*.csv / Excel)
 *   - 正式接入后端时,由 Luban 导出 ts/json 后替换本文件即可,
 *     字段命名保持 bean 一致,引擎层零改动。
 * 见 docs/ARCHITECTURE.md 中的 Luban 表结构定义。
 * ============================================================
 */

export type ResourceKey = "energy" | "material" | "research" | "special";
export type RouteId = "machine" | "swarm" | "psionic";

export interface Cost {
  energy?: number;
  material?: number;
  research?: number;
  special?: number;
}

export type Effect =
  | { k: "mult"; res: ResourceKey | "all"; v: number } // 产出乘区
  | { k: "clickMult"; v: number } // 点击倍率
  | { k: "autoClick"; v: number } // 自动点击 +n次/秒
  | { k: "crit"; v: number } // 暴击率 +v
  | { k: "countdown"; v: number } // 地球倒计时 +v 秒
  | { k: "enableRoute"; route: RouteId } // 解锁科技路线
  | { k: "startKit"; v: number } // 开局补给 ×v
  | { k: "note"; text: string } // 仅展示说明
  | { k: "final" }; // 曲率引擎就绪

/* ---------------- tb_global 全局表 ---------------- */
export const GLOBAL = {
  version: 1,
  earthCountdownSeconds: 3600, // 地球解体倒计时(每轮)
  offlineCapHours: 8, // 离线收益上限
  offlineEfficiency: 0.5, // 离线效率
  clickBasePower: 1,
  critMult: 5, // 暴击倍率
  milestoneEvery: 25, // 每拥有 N 座同建筑
  milestoneMult: 2, // 产出 ×2
  launchEnergyReq: 250_000, // 发射所需能量
  launchMaterialReq: 25_000, // 发射所需物资
  tickMs: 250,
  autosaveMs: 8000,
  crateLifeSeconds: 45, // 补给舱存活时间
  rewardBase: 3, // 逃生保底星核
} as const;

/* ---------------- tb_building 建筑表 ---------------- */
export interface BuildingDef {
  id: string;
  name: string;
  en: string;
  chain: "energy" | "material" | "research" | "special";
  desc: string;
  baseCost: Cost;
  scale: number;
  produces: ResourceKey;
  perSec: number;
  unlockResearch?: string;
  unlockRoute?: RouteId;
}

export const BUILDINGS: BuildingDef[] = [
  // —— 能源链 ——
  { id: "b_solar", name: "太阳能阵列", en: "SOLAR ARRAY", chain: "energy", desc: "危机纪元最可靠的第一缕光。", baseCost: { energy: 15 }, scale: 1.15, produces: "energy", perSec: 0.5 },
  { id: "b_fossil", name: "化石电站", en: "FOSSIL PLANT", chain: "energy", desc: "烧掉旧世界的遗产,换取最后一程。", baseCost: { energy: 110, material: 12 }, scale: 1.15, produces: "energy", perSec: 3 },
  { id: "b_fission", name: "裂变电站", en: "FISSION PLANT", chain: "energy", desc: "铀燃料棒彻夜咆哮,如同文明的喘息。", baseCost: { energy: 2400, material: 120 }, scale: 1.16, produces: "energy", perSec: 16, unlockResearch: "r_nuclear" },
  { id: "b_fusion", name: "聚变反应堆", en: "FUSION REACTOR", chain: "energy", desc: "在海水中点燃太阳。", baseCost: { energy: 36000, material: 900 }, scale: 1.17, produces: "energy", perSec: 120, unlockResearch: "r_fusion" },
  { id: "b_antimatter", name: "反物质堆", en: "ANTIMATTER CORE", chain: "energy", desc: "一克湮灭,一座城市的一年。", baseCost: { energy: 520000, material: 7000 }, scale: 1.18, produces: "energy", perSec: 950, unlockResearch: "r_antimatter" },
  { id: "b_zero", name: "零点引擎", en: "ZERO-POINT DRIVE", chain: "energy", desc: "从真空本身榨取能量,神明般的技术。", baseCost: { energy: 6500000, material: 55000 }, scale: 1.18, produces: "energy", perSec: 8000, unlockResearch: "r_vacuum" },
  // —— 物资链(消耗电力运转) ——
  { id: "b_scavenge", name: "拾荒者小队", en: "SCAVENGERS", chain: "material", desc: "在秩序崩解的城市里回收文明的残骸。", baseCost: { energy: 40 }, scale: 1.15, produces: "material", perSec: 0.5 },
  { id: "b_mine", name: "纳米矿机", en: "NANO MINER", chain: "material", desc: "成群的纳米虫将岩层啃噬成可用元素。", baseCost: { energy: 1800, material: 100 }, scale: 1.16, produces: "material", perSec: 5, unlockResearch: "r_nano" },
  { id: "b_smelter", name: "轨道熔炼厂", en: "ORBITAL FOUNDRY", chain: "material", desc: "小行星带成了人类的露天矿场。", baseCost: { energy: 30000, material: 800 }, scale: 1.17, produces: "material", perSec: 42, unlockResearch: "r_orbital" },
  { id: "b_molecular", name: "分子重构炉", en: "MOLECULAR FORGE", chain: "material", desc: "垃圾进,合金出。物质只是排列的艺术。", baseCost: { energy: 480000, material: 9000 }, scale: 1.18, produces: "material", perSec: 360, unlockResearch: "r_molecular" },
  // —— 科研链 ——
  { id: "b_study", name: "临时研究组", en: "THINK TANK", chain: "research", desc: "避难所里亮到深夜的灯。", baseCost: { material: 60 }, scale: 1.15, produces: "research", perSec: 0.3 },
  { id: "b_lab", name: "综合实验室", en: "MEGA LAB", chain: "research", desc: "人类最后的十五年教育,浓缩于此。", baseCost: { material: 700, energy: 2000 }, scale: 1.16, produces: "research", perSec: 2.2, unlockResearch: "r_automation" },
  { id: "b_quantum", name: "量子超算", en: "QUANTUM CORE", chain: "research", desc: "一纳秒的推演,胜过学者一生。", baseCost: { material: 8500, energy: 30000 }, scale: 1.17, produces: "research", perSec: 16, unlockResearch: "r_ai" },
  // —— 路线专属 ——
  { id: "b_datacore", name: "数据核心", en: "DATA CORE", chain: "special", desc: "机械路线:源源不断地产出「算力」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "machine" },
  { id: "b_spire", name: "孵化尖塔", en: "HATCHERY SPIRE", chain: "special", desc: "蜂群路线:溫热地表下产出「生物质」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "swarm" },
  { id: "b_monolith", name: "灵能方碑", en: "PSION MONOLITH", chain: "special", desc: "灵能路线:静默石碑汇聚「灵能」。", baseCost: { energy: 20000, material: 3000 }, scale: 1.16, produces: "special", perSec: 1.2, unlockRoute: "psionic" },
];

/* ---------------- tb_click 点击升级表 ---------------- */
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

export const CLICK_UPGRADES: ClickUpgradeDef[] = [
  { id: "u_click", name: "聚能矩阵", desc: "强化核心共鸣,每次点击产出翻倍。", baseCost: 40, scale: 3.1, max: 25, effect: { k: "clickMult", v: 2 }, perText: "点击产出 ×2" },
  { id: "u_auto", name: "采集无人机", desc: "不知疲倦的自动采集单元。", baseCost: 180, scale: 3.4, max: 20, effect: { k: "autoClick", v: 1 }, perText: "+1 次自动点击/秒" },
  { id: "u_crit", name: "过载协议", desc: "让核心周期性超载运转。", baseCost: 900, scale: 4, max: 10, effect: { k: "crit", v: 0.04 }, perText: `暴击率 +4%(暴击 ×${GLOBAL.critMult})` },
];

/* ---------------- tb_research 科技树 ---------------- */
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

export const ERAS: Array<{ name: string; en: string; flavor: string }> = [
  { name: "危机纪元", en: "ERA OF CRISIS", flavor: "倒计时开始,人类第一次为同一个目标工作。" },
  { name: "重整纪元", en: "RECONSTRUCTION", flavor: "秩序崩塌之后,工程师成为新的祭司。" },
  { name: "环轨纪元", en: "ORBITAL AGE", flavor: "我们的目光越过云层,落在轨道之上。" },
  { name: "飞升前夜", en: "EVE OF ASCENSION", flavor: "物种的定义,第一次由我们自己改写。" },
  { name: "深空纪元", en: "DEEP SPACE", flavor: "物理学最后一页写着:此路可通群星。" },
  { name: "终章", en: "FINALE", flavor: "文明的门票,只留给跑得最快的孩子。" },
];

export const RESEARCH: ResearchDef[] = [
  // Era 0
  { id: "r_command", name: "危机统筹", desc: "建立全球联合指挥部,一切产出提升。", era: 0, cost: { research: 6 }, req: [], effects: [{ k: "mult", res: "all", v: 1.2 }] },
  { id: "r_survival", name: "配给制工业", desc: "每一份物资都被计算,物资产出提升。", era: 0, cost: { research: 25, material: 40 }, req: ["r_command"], effects: [{ k: "mult", res: "material", v: 1.6 }] },
  // Era 1
  { id: "r_solar2", name: "轨道光伏增效", desc: "展开十万面光伏帆,能量产出提升。", era: 1, cost: { research: 50 }, req: ["r_command"], effects: [{ k: "mult", res: "energy", v: 1.5 }] },
  { id: "r_nuclear", name: "核能复兴", desc: "重启被封存的裂变技术,解锁裂变电站。", era: 1, cost: { research: 130, material: 150 }, req: ["r_survival", "r_solar2"], effects: [{ k: "mult", res: "energy", v: 1.2 }] },
  { id: "r_automation", name: "全自动产线", desc: "机器制造机器,解锁综合实验室。", era: 1, cost: { research: 220, material: 260 }, req: ["r_survival"], effects: [{ k: "mult", res: "research", v: 1.3 }] },
  // Era 2
  { id: "r_nano", name: "纳米冶金", desc: "从原子层面重组材料,解锁纳米矿机。", era: 2, cost: { research: 520, material: 700 }, req: ["r_automation"], effects: [{ k: "note", text: "解锁建筑「纳米矿机」" }] },
  { id: "r_orbital", name: "轨道电梯", desc: "从赤道直通同步轨道,解锁轨道熔炼厂。", era: 2, cost: { research: 950, material: 1400 }, req: ["r_nano"], effects: [{ k: "mult", res: "material", v: 1.5 }] },
  { id: "r_ai", name: "强人工智能", desc: "它诞生的第一句话是:「计算完毕,人类尚有希望。」解锁量子超算与机械路线的钥匙。", era: 2, cost: { research: 1700, material: 2200 }, req: ["r_automation", "r_nuclear"], effects: [{ k: "mult", res: "research", v: 2 }, { k: "enableRoute", route: "machine" }] },
  // Era 3
  { id: "r_gene", name: "基因飞升", desc: "改写生命的底层代码,解锁蜂群路线。", quote: "如果躯体是牢笼,那就再造一副。", era: 3, cost: { research: 3200, material: 4000 }, req: ["r_ai"], effects: [{ k: "enableRoute", route: "swarm" }] },
  { id: "r_psy", name: "意识解码", desc: "证明意识可以脱离肉体存在,解锁灵能路线。", quote: "我们向内看,看见了宇宙。", era: 3, cost: { research: 3400, material: 4200 }, req: ["r_ai"], effects: [{ k: "enableRoute", route: "psionic" }] },
  { id: "r_fusion", name: "受控核聚变", desc: "驯服恒星之火,解锁聚变反应堆。", era: 3, cost: { research: 2600, material: 3000 }, req: ["r_orbital"], effects: [{ k: "mult", res: "energy", v: 2 }, { k: "note", text: "解锁建筑「聚变反应堆」" }] },
  // Era 4
  { id: "r_antimatter", name: "反物质约束", desc: "在磁瓶中囚禁湮灭,解锁反物质堆。", era: 4, cost: { research: 12000, material: 14000 }, req: ["r_fusion"], effects: [{ k: "mult", res: "all", v: 1.3 }] },
  { id: "r_molecular", name: "分子编程", desc: "物质即信息,解锁分子重构炉。", era: 4, cost: { research: 21000, material: 24000 }, req: ["r_antimatter"], effects: [{ k: "mult", res: "material", v: 2 }] },
  { id: "r_warp", name: "曲率理论", desc: "空间可以被折叠——方舟计划由此成立。", quote: "这艘船不飞向远方,它让远方来到面前。", era: 4, cost: { research: 55000, material: 70000 }, req: ["r_antimatter"], effects: [{ k: "note", text: "方舟计划最终理论完成" }] },
  // Era 5
  { id: "r_vacuum", name: "真空零点能", desc: "向虚空借债,解锁零点引擎。", era: 5, cost: { research: 120000, material: 150000 }, req: ["r_molecular"], effects: [{ k: "mult", res: "energy", v: 2 }] },
  { id: "r_engine", name: "曲率引擎", desc: "终章之作。建成后,方舟随时可以点火逃离。", quote: "为时未晚。", era: 5, cost: { research: 90000, material: 110000 }, req: ["r_warp"], effects: [{ k: "final" }] },
];

/* ---------------- tb_route 科技路线表 ---------------- */
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

export const ROUTES: RouteDef[] = [
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
];

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

export const ROUTE_UPGRADES: RouteUpgradeDef[] = [
  // machine
  { id: "ru_m_furnace", route: "machine", name: "泰坦锻炉", desc: "能量产出 ×1.35 / 级", max: 10, baseCost: 30, scale: 1.75, effect: { k: "mult", res: "energy", v: 1.35 } },
  { id: "ru_m_net", route: "machine", name: "分布式矩阵", desc: "科研产出 ×1.4 / 级", max: 10, baseCost: 40, scale: 1.8, effect: { k: "mult", res: "research", v: 1.4 } },
  { id: "ru_m_drone", route: "machine", name: "无人军团", desc: "自动点击 +3 次/秒 / 级", max: 10, baseCost: 55, scale: 1.9, effect: { k: "autoClick", v: 3 } },
  { id: "ru_m_alloy", route: "machine", name: "自修复合金", desc: "物资产出 ×1.35 / 级", max: 10, baseCost: 40, scale: 1.8, effect: { k: "mult", res: "material", v: 1.35 } },
  // swarm
  { id: "ru_s_breed", route: "swarm", name: "基因裂变舱", desc: "全部产出 ×1.2 / 级", max: 10, baseCost: 45, scale: 1.85, effect: { k: "mult", res: "all", v: 1.2 } },
  { id: "ru_s_hive", route: "swarm", name: "蜂巢心智", desc: "科研产出 ×1.45 / 级", max: 10, baseCost: 40, scale: 1.8, effect: { k: "mult", res: "research", v: 1.45 } },
  { id: "ru_s_acid", route: "swarm", name: "熔解酸巢", desc: "物资产出 ×1.5 / 级", max: 10, baseCost: 35, scale: 1.75, effect: { k: "mult", res: "material", v: 1.5 } },
  { id: "ru_s_tide", route: "swarm", name: "生物质潮汐", desc: "点击产出 ×1.6 / 级", max: 10, baseCost: 50, scale: 1.9, effect: { k: "clickMult", v: 1.6 } },
  // psionic
  { id: "ru_p_seer", route: "psionic", name: "预知回路", desc: "暴击率 +5% / 级", max: 10, baseCost: 35, scale: 1.8, effect: { k: "crit", v: 0.05 } },
  { id: "ru_p_void", route: "psionic", name: "虚空汲取", desc: "能量产出 ×1.45 / 级", max: 10, baseCost: 40, scale: 1.8, effect: { k: "mult", res: "energy", v: 1.45 } },
  { id: "ru_p_mind", route: "psionic", name: "意志共鸣", desc: "科研产出 ×1.4 / 级", max: 10, baseCost: 40, scale: 1.8, effect: { k: "mult", res: "research", v: 1.4 } },
  { id: "ru_p_warp", route: "psionic", name: "现实扭曲", desc: "全部产出 ×1.22 / 级", max: 10, baseCost: 55, scale: 1.9, effect: { k: "mult", res: "all", v: 1.22 } },
];

/* ---------------- tb_core 星核遗产表(跨轮回) ---------------- */
export interface CoreUpgradeDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number; // 星核
  inc: number; // 每级递增至 base + inc*lvl
  effectPer: Effect;
}

export const CORE_UPGRADES: CoreUpgradeDef[] = [
  { id: "cu_ember", name: "永恒火种", desc: "每一轮回,能量产出 ×1.3 / 级", max: 20, base: 6, inc: 4, effectPer: { k: "mult", res: "energy", v: 1.3 } },
  { id: "cu_forge", name: "永恒铸炉", desc: "每一轮回,物资产出 ×1.3 / 级", max: 20, base: 6, inc: 4, effectPer: { k: "mult", res: "material", v: 1.3 } },
  { id: "cu_palace", name: "记忆宫殿", desc: "每一轮回,科研产出 ×1.25 / 级", max: 20, base: 6, inc: 4, effectPer: { k: "mult", res: "research", v: 1.25 } },
  { id: "cu_anchor", name: "时空之锚", desc: "每一轮回,地球倒计时 +10分钟 / 级", max: 10, base: 8, inc: 6, effectPer: { k: "countdown", v: 600 } },
  { id: "cu_seeder", name: "文明火种库", desc: "每轮回开局即携带补给(能量/物资/科研)", max: 15, base: 4, inc: 3, effectPer: { k: "startKit", v: 1 } },
];

/* ---------------- tb_story 倒计时剧情事件 ---------------- */
export interface StoryEvent {
  id: string;
  remainSec: number; // 剩余时间 ≤ 该值时触发
  text: string;
  tone: "info" | "warn" | "danger";
}

export const STORY_EVENTS: StoryEvent[] = [
  { id: "st_start", remainSec: 3599, text: "「方舟协定」签署完毕,全球资源统一调度。倒计时开始。", tone: "info" },
  { id: "st_75", remainSec: 2700, text: "地壳应力突破临界值,环太平洋火山群接连苏醒。", tone: "warn" },
  { id: "st_60", remainSec: 2160, text: "最后一批冬眠舱完成装载,孩子们还不知道发生了什么。", tone: "info" },
  { id: "st_40", remainSec: 1440, text: "月球监测站失联。引力网格出现无法解释的涟漪。", tone: "warn" },
  { id: "st_25", remainSec: 900, text: "全球广播进入静默。所有人停下了手中的告别。", tone: "danger" },
  { id: "st_10", remainSec: 360, text: "地核裂解不可逆。海洋开始沸腾。", tone: "danger" },
  { id: "st_last", remainSec: 60, text: "最后六十秒。所有传感器转向母星,作别。", tone: "danger" },
];

/* ---------------- tb_event 随机事件 ---------------- */
export interface RandomEventDef {
  id: string;
  name: string;
  text: string;
  tone: "info" | "success" | "warn" | "danger";
  kind: "instant" | "crate" | "deadline";
  /** instant/deadline: 结算参数见 effect */
  res?: ResourceKey;
  seconds?: number; // 折算多少秒的产量
  deadlineAdd?: number;
}

export const RANDOM_EVENTS: RandomEventDef[] = [
  { id: "ev_solar", name: "太阳风暴", text: "强烈的太阳风掠过轨道阵列,充能效率暴涨。", tone: "success", kind: "instant", res: "energy", seconds: 90 },
  { id: "ev_debris", name: "彗星残骸带", text: "冰质彗尾携带着大量可用元素经过近地轨道。", tone: "success", kind: "instant", res: "material", seconds: 120 },
  { id: "ev_signal", name: "深空信号", text: "捕捉到一段规律的脉冲信号,研究组连夜完成了解密推演。", tone: "success", kind: "instant", res: "research", seconds: 90 },
  { id: "ev_sling", name: "引力弹弓", text: "领航组利用天体引力意外争取到宝贵时间。", tone: "info", kind: "deadline", deadlineAdd: 120 },
  { id: "ev_crate", name: "漂流补给舱", text: "一个冷战时期的补给舱漂入雷达范围——快去回收!", tone: "success", kind: "crate" },
  { id: "ev_raiders", name: "轨道流寇", text: "流寇编队试图靠近储存区,被防御系统驱离。", tone: "warn", kind: "instant", res: "energy", seconds: -45 },
];

export const EVENT_MIN_GAP = 170;
export const EVENT_MAX_GAP = 400;

/* ---------------- 资源元信息 ---------------- */
export const RES_META: Record<ResourceKey, { name: string; en: string; color: string }> = {
  energy: { name: "能量", en: "ENERGY", color: "#22d3ee" },
  material: { name: "物资", en: "MATERIAL", color: "#f59e0b" },
  research: { name: "科研", en: "SCIENCE", color: "#4ade80" },
  special: { name: "特殊", en: "SPECIAL", color: "#a78bfa" },
};

export const LEADERBOARD_NAMES = [
  "文明观察者#4211", "洛希极限", "猎户座之泪", "白矮星信使", "引力波哀伤",
  "第三旋翼", "量子凝视者", "暗淡蓝点", "奥尔特云海", "王维轨道站",
  "银心漫步者", "日冕抛射物", "混沌信使#77", "先遣舰队残部", "柯伊伯带守门人",
  "潮汐锁定", "玻色子凝聚", "阿贝尔2218", "最后一盏路灯", "歸零者",
  "超新星余烬", "真空衰变", "巨引源航标", "天鹅座-X1", "长蛇座殖民团",
  "叙事层之外", "反德西特航员", "普朗克尘埃", "永恒暴胀泡沫", "狄拉克之海",
];

/* 工具:按 id 查表 */
export const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.id, b]));
export const RESEARCH_MAP = new Map(RESEARCH.map((r) => [r.id, r]));
export const ROUTE_MAP = new Map(ROUTES.map((r) => [r.id, r]));
export const ROUTE_UPGRADE_MAP = new Map(ROUTE_UPGRADES.map((u) => [u.id, u]));
export const CORE_UPGRADE_MAP = new Map(CORE_UPGRADES.map((u) => [u.id, u]));
export const CLICK_UPGRADE_MAP = new Map(CLICK_UPGRADES.map((u) => [u.id, u]));

/** effect 转描述文本 */
export function effectText(e: Effect, perLevel = false): string[] {
  const t = perLevel ? " / 级" : "";
  const resName = (r: ResourceKey | "all") => (r === "all" ? "全部" : RES_META[r].name);
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
      return [`解锁科技路线「${ROUTE_MAP.get(e.route)?.name}」`];
    case "startKit":
      return [`开局补给 +100%${t}`];
    case "note":
      return [e.text];
    case "final":
      return ["曲率引擎就绪 — 方舟可以点火"];
  }
}
