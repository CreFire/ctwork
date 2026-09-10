/**
 * 配置校验层 - 保证 Luban 生成的配置表健壮性
 * 所有校验失败均提供明确错误信息 + 默认值回退策略
 */

import type { Building, ClickUpgrade, Research, Route, RouteUpgrade, CoreUpgrade, StoryEvent, RandomEvent, GlobalConfig } from "./generated/Beans";

export interface ValidationResult<T> {
  ok: boolean;
  data: T;
  errors: string[];
  warnings: string[];
}

const RESOURCE_KEYS = ["energy", "material", "research", "special", "all"] as const;
const CHAIN_KEYS = ["energy", "material", "research", "special"] as const;
const ROUTE_IDS = ["machine", "swarm", "psionic"] as const;
const EFFECT_KINDS = ["mult", "clickMult", "autoClick", "crit", "countdown", "enableRoute", "startKit", "note", "final"] as const;

function isValidResource(r: string): boolean {
  return (RESOURCE_KEYS as readonly string[]).includes(r);
}

function isValidChain(c: string): boolean {
  return (CHAIN_KEYS as readonly string[]).includes(c);
}

function isValidRoute(r: string): boolean {
  return (ROUTE_IDS as readonly string[]).includes(r);
}

function isValidEffectKind(k: string): boolean {
  return (EFFECT_KINDS as readonly string[]).includes(k);
}

export function validateGlobal(raw: any): ValidationResult<GlobalConfig> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const defaults: GlobalConfig = {
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
    _raw: raw,
  } as any;

  if (!raw) {
    errors.push("Global config is null/undefined, using defaults");
    return { ok: false, data: defaults, errors, warnings };
  }

  const data: any = { ...defaults, ...raw, _raw: raw._raw || raw };

  // 范围校验
  if (data.earthCountdownSeconds < 60 || data.earthCountdownSeconds > 86400) {
    warnings.push(`earthCountdownSeconds ${data.earthCountdownSeconds} out of [60,86400], clamped`);
    data.earthCountdownSeconds = Math.min(86400, Math.max(60, data.earthCountdownSeconds));
  }
  if (data.offlineEfficiency < 0 || data.offlineEfficiency > 1) {
    warnings.push(`offlineEfficiency ${data.offlineEfficiency} out of [0,1], clamped`);
    data.offlineEfficiency = Math.min(1, Math.max(0, data.offlineEfficiency));
  }
  if (data.milestoneEvery < 1) {
    errors.push(`milestoneEvery ${data.milestoneEvery} <1, reset to 25`);
    data.milestoneEvery = 25;
  }
  if (data.milestoneMult < 1) {
    errors.push(`milestoneMult ${data.milestoneMult} <1, reset to 2`);
    data.milestoneMult = 2;
  }
  if (data.tickMs < 50 || data.tickMs > 5000) {
    warnings.push(`tickMs ${data.tickMs} out of [50,5000], clamped`);
    data.tickMs = Math.min(5000, Math.max(50, data.tickMs));
  }
  if (data.maxCritRate < 0 || data.maxCritRate > 1) {
    warnings.push(`maxCritRate ${data.maxCritRate} out of [0,1], clamped`);
    data.maxCritRate = Math.min(1, Math.max(0, data.maxCritRate));
  }

  return { ok: errors.length === 0, data, errors, warnings };
}

export function validateBuildings(raw: Building[]): ValidationResult<Building[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: Building[] = [];

  for (const b of raw) {
    if (!b.id) {
      errors.push(`Building missing id: ${JSON.stringify(b)}`);
      continue;
    }
    if (seen.has(b.id)) {
      errors.push(`Duplicate building id: ${b.id}`);
      continue;
    }
    seen.add(b.id);

    if (!b.name) warnings.push(`Building ${b.id} missing name`);
    if (!isValidChain(b.chain)) {
      errors.push(`Building ${b.id} invalid chain ${b.chain}`);
      continue;
    }
    if (!isValidResource(b.produces)) {
      errors.push(`Building ${b.id} invalid produces ${b.produces}`);
      continue;
    }
    if (b.scale < 1.0 || b.scale > 2.0) {
      warnings.push(`Building ${b.id} scale ${b.scale} out of [1.0,2.0]`);
      b.scale = Math.min(2.0, Math.max(1.0, b.scale));
    }
    if (b.perSec <= 0) {
      errors.push(`Building ${b.id} perSec ${b.perSec} <=0`);
      continue;
    }
    if (b.unlockRoute && !isValidRoute(b.unlockRoute)) {
      errors.push(`Building ${b.id} invalid unlockRoute ${b.unlockRoute}`);
      continue;
    }
    valid.push(b);
  }

  if (valid.length === 0) errors.push("No valid buildings found");

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateClickUpgrades(raw: ClickUpgrade[]): ValidationResult<ClickUpgrade[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: ClickUpgrade[] = [];

  for (const u of raw) {
    if (!u.id) {
      errors.push(`ClickUpgrade missing id`);
      continue;
    }
    if (seen.has(u.id)) {
      errors.push(`Duplicate click upgrade id: ${u.id}`);
      continue;
    }
    seen.add(u.id);
    if (!isValidEffectKind(u.effect?.k)) {
      errors.push(`ClickUpgrade ${u.id} invalid effect kind ${u.effect?.k}`);
      continue;
    }
    if (u.max < 1 || u.max > 1000) {
      warnings.push(`ClickUpgrade ${u.id} max ${u.max} out of [1,1000], clamped`);
      u.max = Math.min(1000, Math.max(1, u.max));
    }
    valid.push(u);
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateResearch(raw: Research[]): ValidationResult<Research[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: Research[] = [];

  for (const r of raw) {
    if (!r.id) {
      errors.push(`Research missing id`);
      continue;
    }
    if (seen.has(r.id)) {
      errors.push(`Duplicate research id: ${r.id}`);
      continue;
    }
    seen.add(r.id);
    if (r.era < 0 || r.era > 5) {
      errors.push(`Research ${r.id} era ${r.era} out of [0,5]`);
      continue;
    }
    // 校验 effects
    for (const e of r.effects || []) {
      if (!isValidEffectKind(e.k)) {
        errors.push(`Research ${r.id} invalid effect kind ${e.k}`);
      }
      if (e.k === 'mult' && e.res && !isValidResource(e.res)) {
        errors.push(`Research ${r.id} invalid effect res ${e.res}`);
      }
      if (e.k === 'enableRoute' && e.route && !isValidRoute(e.route)) {
        errors.push(`Research ${r.id} invalid enableRoute ${e.route}`);
      }
    }
    // 校验 req 存在性在第二轮，此处仅警告空
    valid.push(r);
  }

  // 二次校验前置依赖是否存在
  const idSet = new Set(valid.map(r => r.id));
  for (const r of valid) {
    for (const req of r.req || []) {
      if (!idSet.has(req)) {
        warnings.push(`Research ${r.id} req ${req} not found`);
      }
    }
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateRoutes(raw: Route[]): ValidationResult<Route[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: Route[] = [];

  for (const r of raw) {
    if (!r.id) {
      errors.push(`Route missing id`);
      continue;
    }
    if (!isValidRoute(r.id)) {
      errors.push(`Route invalid id ${r.id}`);
      continue;
    }
    if (seen.has(r.id)) {
      errors.push(`Duplicate route id: ${r.id}`);
      continue;
    }
    seen.add(r.id);
    if (!r.requireResearch) warnings.push(`Route ${r.id} missing requireResearch`);
    valid.push(r);
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateRouteUpgrades(raw: RouteUpgrade[]): ValidationResult<RouteUpgrade[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: RouteUpgrade[] = [];

  for (const u of raw) {
    if (!u.id) {
      errors.push(`RouteUpgrade missing id`);
      continue;
    }
    if (seen.has(u.id)) {
      errors.push(`Duplicate route upgrade id: ${u.id}`);
      continue;
    }
    seen.add(u.id);
    if (!isValidRoute(u.route)) {
      errors.push(`RouteUpgrade ${u.id} invalid route ${u.route}`);
      continue;
    }
    if (!isValidEffectKind(u.effect?.k)) {
      errors.push(`RouteUpgrade ${u.id} invalid effect kind ${u.effect?.k}`);
      continue;
    }
    if (u.max < 1 || u.max > 100) {
      warnings.push(`RouteUpgrade ${u.id} max ${u.max} out of [1,100], clamped`);
      u.max = Math.min(100, Math.max(1, u.max));
    }
    if (u.scale < 1.0 || u.scale > 3.0) {
      warnings.push(`RouteUpgrade ${u.id} scale ${u.scale} out of [1.0,3.0]`);
      u.scale = Math.min(3.0, Math.max(1.0, u.scale));
    }
    valid.push(u);
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateCoreUpgrades(raw: CoreUpgrade[]): ValidationResult<CoreUpgrade[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: CoreUpgrade[] = [];

  for (const u of raw) {
    if (!u.id) {
      errors.push(`CoreUpgrade missing id`);
      continue;
    }
    if (seen.has(u.id)) {
      errors.push(`Duplicate core upgrade id: ${u.id}`);
      continue;
    }
    seen.add(u.id);
    if (!isValidEffectKind(u.effectPer?.k)) {
      errors.push(`CoreUpgrade ${u.id} invalid effectPer kind ${u.effectPer?.k}`);
      continue;
    }
    if (u.max < 1 || u.max > 100) {
      warnings.push(`CoreUpgrade ${u.id} max ${u.max} out of [1,100]`);
      u.max = Math.min(100, Math.max(1, u.max));
    }
    valid.push(u);
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateStory(raw: StoryEvent[]): ValidationResult<StoryEvent[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: StoryEvent[] = [];

  for (const s of raw) {
    if (!s.id) {
      errors.push(`StoryEvent missing id`);
      continue;
    }
    if (seen.has(s.id)) {
      errors.push(`Duplicate story id: ${s.id}`);
      continue;
    }
    seen.add(s.id);
    if (s.remainSec < 0) {
      warnings.push(`Story ${s.id} remainSec ${s.remainSec} <0, clamped to 0`);
      s.remainSec = 0;
    }
    valid.push(s);
  }

  valid.sort((a,b) => b.remainSec - a.remainSec);
  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateRandomEvents(raw: RandomEvent[]): ValidationResult<RandomEvent[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const valid: RandomEvent[] = [];

  for (const e of raw) {
    if (!e.id) {
      errors.push(`RandomEvent missing id`);
      continue;
    }
    if (seen.has(e.id)) {
      errors.push(`Duplicate random event id: ${e.id}`);
      continue;
    }
    seen.add(e.id);
    if (e.kind === 'instant' && !e.res) {
      warnings.push(`RandomEvent ${e.id} instant without res`);
    }
    if (e.res && !isValidResource(e.res)) {
      errors.push(`RandomEvent ${e.id} invalid res ${e.res}`);
      continue;
    }
    valid.push(e);
  }

  return { ok: errors.length === 0, data: valid, errors, warnings };
}

export function validateAll(tables: any) {
  const results = {
    global: validateGlobal(tables.global),
    buildings: validateBuildings(tables.buildings || []),
    clickUpgrades: validateClickUpgrades(tables.clickUpgrades || []),
    researches: validateResearch(tables.researches || []),
    routes: validateRoutes(tables.routes || []),
    routeUpgrades: validateRouteUpgrades(tables.routeUpgrades || []),
    coreUpgrades: validateCoreUpgrades(tables.coreUpgrades || []),
    stories: validateStory(tables.stories || []),
    randomEvents: validateRandomEvents(tables.randomEvents || []),
  };

  const allOk = Object.values(results).every(r => r.ok);
  const allErrors = Object.values(results).flatMap(r => r.errors);
  const allWarnings = Object.values(results).flatMap(r => r.warnings);

  return { ok: allOk, results, errors: allErrors, warnings: allWarnings };
}
