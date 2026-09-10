#!/usr/bin/env node
/**
 * 配置双端一致性检查:Luban 表 ⇄ Go 服务端权威表
 *
 *   用法: npm run check:parity   (CI 亦执行,无需 Go 工具链)
 *
 * 背景:游戏数值以 server/luban/tables/*.csv 为唯一来源,由 scripts/luban-gen.mjs
 * 导出 TS(src/game/generated)与 Go(server/internal/config/gen)。
 * 服务端反作弊引擎 server/internal/engine/config.go 目前仍是手写字面量,
 * 本脚本解析该文件并与 server/data/tables.json 逐项比对:
 * 一旦有人改了表却没同步 Go(或反之),立刻报错,避免「前端一套数值、
 * 服务端另一套数值」导致反作弊误判。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GO_CONFIG = path.join(ROOT, "server/internal/engine/config.go");
const TABLES_JSON = path.join(ROOT, "server/data/tables.json");

const RES_CONST = { ResEnergy: "energy", ResMaterial: "material", ResResearch: "research", ResSpecial: "special" };
const EFF_CONST = {
  EffMult: "mult",
  EffClickMult: "clickMult",
  EffAutoClick: "autoClick",
  EffCrit: "crit",
  EffCountdown: "countdown",
  EffEnableRoute: "enableRoute",
  EffStartKit: "startKit",
};

const problems = [];
const fail = (msg) => problems.push(msg);

/* ---------------- 极简 Go 字面量解析 ---------------- */

/** 按顶层逗号切分(忽略括号/引号内的逗号) */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\" && i + 1 < s.length) { cur += s[++i]; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; cur += ch; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 把 Go 值字面量转成 JS 值 */
function parseValue(raw) {
  const v = raw.trim();
  if (!v) return undefined;
  if (v.startsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (RES_CONST[v]) return RES_CONST[v];
  if (EFF_CONST[v]) return EFF_CONST[v];
  if (v === "nil") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[]string{")) {
    const inner = v.slice("[]string{".length, -1);
    return splitTop(inner).map(parseValue);
  }
  if (v.startsWith("Cost{")) return parseCost(v);
  if (v.startsWith("[]Effect{")) {
    const inner = v.slice("[]Effect{".length, -1);
    return splitTop(inner).map(parseValue).filter(Boolean);
  }
  if (v.startsWith("Effect{")) return parseEffectStruct(v);
  if (v.startsWith("{")) return parseEffectStruct("Effect" + v);
  if (v.startsWith("Mult(")) {
    const args = splitTop(v.slice("Mult(".length, -1)).map(parseValue);
    return { k: "mult", res: args[0], v: args[1] };
  }
  throw new Error(`无法解析的 Go 字面量: ${v}`);
}

function parseCost(v) {
  const cost = {};
  for (const part of splitTop(v.slice("Cost{".length, -1))) {
    const i = part.indexOf(":");
    const key = part.slice(0, i).trim().toLowerCase();
    cost[key] = parseValue(part.slice(i + 1));
  }
  for (const k of ["energy", "material", "research", "special"]) if (cost[k] === undefined) cost[k] = 0;
  return cost;
}

function parseEffectStruct(v) {
  const eff = {};
  for (const part of splitTop(v.slice("Effect{".length, -1))) {
    const i = part.indexOf(":");
    const key = part.slice(0, i).trim();
    const val = parseValue(part.slice(i + 1));
    if (key === "K") eff.k = val;
    else if (key === "Res") eff.res = val;
    else if (key === "V") eff.v = val;
    else if (key === "Route") eff.route = val;
    else if (key === "Text") eff.text = val;
  }
  return eff;
}

/** 抽取 `var Name = []T{ ... }` 的所有行,返回 [{field: value}] */
function parseGoSlice(src, name) {
  const re = new RegExp(`var ${name} = \\[\\]\\w+\\{([\\s\\S]*?)\\n\\}`);
  const m = src.match(re);
  if (!m) throw new Error(`config.go 中找不到 var ${name}`);
  const body = m[1];
  const rows = [];
  // 每行一个元素:{...},
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue; // 跳过注释行
    const inner = t.replace(/^\{/, "").replace(/\},?$/, "");
    const row = {};
    for (const part of splitTop(inner)) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      row[part.slice(0, i).trim()] = parseValue(part.slice(i + 1));
    }
    rows.push(row);
  }
  return rows;
}

/** 抽取 const 块中的数值常量 */
function parseGoConsts(src) {
  const consts = {};
  for (const m of src.matchAll(/^\t([A-Z]\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:\/\/.*)?$/gm)) {
    consts[m[1]] = Number(m[2]);
  }
  return consts;
}

/* ---------------- 比对 ---------------- */

const NEAR = 1e-9;
function numEq(a, b) {
  const x = Number(a ?? 0);
  const y = Number(b ?? 0);
  return Math.abs(x - y) <= NEAR * Math.max(1, Math.abs(x), Math.abs(y));
}
function checkNum(label, goVal, csvVal) {
  if (!numEq(goVal, csvVal)) fail(`${label}: Go=${goVal ?? 0} CSV=${csvVal ?? 0}`);
}
function checkStr(label, goVal, csvVal) {
  const a = goVal ?? "";
  const b = csvVal ?? "";
  if (a !== b) fail(`${label}: Go="${a}" CSV="${b}"`);
}
function checkCost(label, goCost, csvCost) {
  const c = csvCost || {};
  for (const k of ["energy", "material", "research", "special"]) {
    checkNum(`${label}.${k}`, (goCost || {})[k] ?? 0, c[k] ?? 0);
  }
}
/** 只比数值型效果:note(纯展示)/final(标记) 服务端不参与计算 */
function effKey(e) {
  return [e.k, e.res ?? "", e.v ?? 0, e.route ?? ""].join("|");
}
function checkEffects(label, goEffs, csvEffs) {
  const goList = (goEffs || []).filter((e) => e && e.k !== "note" && e.k !== "final").map(effKey).sort();
  const csvList = (csvEffs || []).filter((e) => e && e.k !== "note" && e.k !== "final").map(effKey).sort();
  if (goList.join(",") !== csvList.join(",")) {
    fail(`${label}.effects: Go=[${goList.join(", ")}] CSV=[${csvList.join(", ")}]`);
  }
}

function main() {
  for (const f of [GO_CONFIG, TABLES_JSON]) {
    if (!fs.existsSync(f)) {
      console.error(`[parity] 缺少文件 ${path.relative(ROOT, f)}(先执行 npm run gen:luban)`);
      process.exit(1);
    }
  }
  const go = fs.readFileSync(GO_CONFIG, "utf8");
  const t = JSON.parse(fs.readFileSync(TABLES_JSON, "utf8"));

  // —— 全局常量 ——
  const consts = parseGoConsts(go);
  const GMAP = {
    Version: "version",
    EarthCountdownSeconds: "earth_countdown_seconds",
    OfflineCapHours: "offline_cap_hours",
    OfflineEfficiency: "offline_efficiency",
    ClickBasePower: "click_base_power",
    CritMult: "crit_mult",
    MilestoneEvery: "milestone_every",
    MilestoneMult: "milestone_mult",
    LaunchEnergyReq: "launch_energy_req",
    LaunchMaterialReq: "launch_material_req",
    RewardBase: "reward_base",
  };
  for (const [g, c] of Object.entries(GMAP)) {
    if (consts[g] === undefined) fail(`config.go 缺常量 ${g}`);
    else checkNum(`global.${g}`, consts[g], t.global[c]);
  }

  // —— 建筑 ——
  const goBuildings = parseGoSlice(go, "Buildings");
  const csvBuildings = Object.fromEntries(t.buildings.map((b) => [b.id, b]));
  if (goBuildings.length !== t.buildings.length) fail(`buildings 数量: Go=${goBuildings.length} CSV=${t.buildings.length}`);
  for (const b of goBuildings) {
    const c = csvBuildings[b.ID];
    if (!c) { fail(`building ${b.ID}: CSV 中缺失`); continue; }
    checkCost(`building[${b.ID}].baseCost`, b.BaseCost, c.baseCost);
    checkNum(`building[${b.ID}].scale`, b.Scale, c.scale);
    checkNum(`building[${b.ID}].perSec`, b.PerSec, c.perSec);
    checkStr(`building[${b.ID}].produces`, b.Produces, c.produces);
    checkStr(`building[${b.ID}].unlockResearch`, b.UnlockResearch, c.unlockResearch);
    checkStr(`building[${b.ID}].unlockRoute`, b.UnlockRoute, c.unlockRoute);
  }

  // —— 点击升级 ——
  const goClicks = parseGoSlice(go, "ClickUpgrades");
  const csvClicks = Object.fromEntries(t.clickUpgrades.map((b) => [b.id, b]));
  if (goClicks.length !== t.clickUpgrades.length) fail(`clickUpgrades 数量: Go=${goClicks.length} CSV=${t.clickUpgrades.length}`);
  for (const u of goClicks) {
    const c = csvClicks[u.ID];
    if (!c) { fail(`clickUpgrade ${u.ID}: CSV 中缺失`); continue; }
    checkNum(`click[${u.ID}].baseCost`, u.BaseCost, c.baseCost);
    checkNum(`click[${u.ID}].scale`, u.Scale, c.scale);
    checkNum(`click[${u.ID}].max`, u.Max, c.max);
    checkEffects(`click[${u.ID}]`, [u.Eff], [c.effect]);
  }

  // —— 科技树 ——
  const goResearch = parseGoSlice(go, "Research");
  const csvResearch = Object.fromEntries(t.researches.map((b) => [b.id, b]));
  if (goResearch.length !== t.researches.length) fail(`research 数量: Go=${goResearch.length} CSV=${t.researches.length}`);
  for (const r of goResearch) {
    const c = csvResearch[r.ID];
    if (!c) { fail(`research ${r.ID}: CSV 中缺失`); continue; }
    checkCost(`research[${r.ID}].cost`, r.Cost, c.cost);
    const goReq = (r.Req || []).join(",");
    const csvReq = (c.req || []).join(",");
    if (goReq !== csvReq) fail(`research[${r.ID}].req: Go=[${goReq}] CSV=[${csvReq}]`);
    checkEffects(`research[${r.ID}]`, r.Effects, c.effects);
  }

  // —— 路线升级 ——
  const goRouteUp = parseGoSlice(go, "RouteUpgrades");
  const csvRouteUp = Object.fromEntries(t.routeUpgrades.map((b) => [b.id, b]));
  if (goRouteUp.length !== t.routeUpgrades.length) fail(`routeUpgrades 数量: Go=${goRouteUp.length} CSV=${t.routeUpgrades.length}`);
  for (const u of goRouteUp) {
    const c = csvRouteUp[u.ID];
    if (!c) { fail(`routeUpgrade ${u.ID}: CSV 中缺失`); continue; }
    checkStr(`routeUp[${u.ID}].route`, u.Route, c.route);
    checkNum(`routeUp[${u.ID}].max`, u.Max, c.max);
    checkNum(`routeUp[${u.ID}].baseCost`, u.BaseCost, c.baseCost);
    checkNum(`routeUp[${u.ID}].scale`, u.Scale, c.scale);
    checkEffects(`routeUp[${u.ID}]`, [u.Eff], [c.effect]);
  }

  // —— 星核遗产 ——
  const goCore = parseGoSlice(go, "CoreUpgrades");
  const csvCore = Object.fromEntries(t.coreUpgrades.map((b) => [b.id, b]));
  if (goCore.length !== t.coreUpgrades.length) fail(`coreUpgrades 数量: Go=${goCore.length} CSV=${t.coreUpgrades.length}`);
  for (const u of goCore) {
    const c = csvCore[u.ID];
    if (!c) { fail(`coreUpgrade ${u.ID}: CSV 中缺失`); continue; }
    checkNum(`coreUp[${u.ID}].max`, u.Max, c.max);
    checkNum(`coreUp[${u.ID}].base`, u.Base, c.base);
    checkNum(`coreUp[${u.ID}].inc`, u.Inc, c.inc);
    checkEffects(`coreUp[${u.ID}]`, [u.Eff], [c.effectPer]); // Go 字段名为 Eff
  }

  if (problems.length) {
    console.error(`[parity] ❌ 配置双端不一致 ${problems.length} 处:`);
    problems.forEach((p) => console.error("  - " + p));
    console.error("\n修法:改表后执行 npm run gen:luban,并同步 server/internal/engine/config.go");
    process.exit(1);
  }
  console.log(
    `[parity] ✅ 一致:` +
      ` ${Object.keys(GMAP).length} 全局常量 / ${goBuildings.length} 建筑 / ${goClicks.length} 点击升级 /` +
      ` ${goResearch.length} 科技 / ${goRouteUp.length} 路线升级 / ${goCore.length} 星核遗产`,
  );
}

try {
  main();
} catch (e) {
  console.error("[parity] 解析失败:", e.message);
  process.exit(1);
}
