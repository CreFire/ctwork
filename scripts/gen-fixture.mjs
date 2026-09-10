/**
 * 生成 TS↔Go 双端一致性 fixture
 *
 *   用法: node scripts/gen-fixture.mjs
 *   产物: server/internal/engine/testdata/fixture.json
 *
 * 原理: 用 esbuild 把 src/game/engine.ts 打包成 CJS 在 Node 里真实执行,
 * 把「派生属性 / 离线收益 / 星核结算 / 成本公式」的期望值写进 fixture;
 * Go 侧 engine_test.go 载入同一份存档逐字段比对,保证服务端权威公式
 * 与客户端表现层完全一致(docs/ARCHITECTURE.md §2.4)。
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

await build({
  entryPoints: ["src/game/engine.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ".arena-tmp/engine.cjs",
  logLevel: "silent",
});

const require2 = createRequire(import.meta.url);
const E = require2(resolve(".arena-tmp/engine.cjs"));

const t0 = 1_700_000_000_000;

function state(route, buildings, research, clickUp, routeUp, coreUp) {
  const s = E.newSave("U1", t0);
  s.run.route = route;
  Object.assign(s.run.buildings, buildings);
  for (const id of research) s.run.research[id] = true;
  Object.assign(s.run.clickUp, clickUp || {});
  Object.assign(s.run.routeUp, routeUp || {});
  if (coreUp) Object.assign(s.meta.coreUp, coreUp);
  return s;
}

// —— 派生属性用例:覆盖 新手 / 三路线 / 满加成 ——
const scenarios = [
  ["newbie", null, { b_solar: 3 }, [], {}, {}, null],
  ["machine-mid", "machine",
    { b_solar: 30, b_fossil: 12, b_lab: 4, b_quantum: 2, b_datacore: 7 },
    ["r_command", "r_survival", "r_solar2", "r_nuclear", "r_automation", "r_ai", "r_orbital"],
    { u_click: 3, u_auto: 2, u_crit: 1 },
    { ru_m_furnace: 2, ru_m_drone: 1 },
    { cu_ember: 2, cu_seeder: 1 }],
  ["swarm-late", "swarm",
    { b_scavenge: 25, b_spire: 9, b_mine: 6, b_smelter: 2, b_study: 10 },
    ["r_command", "r_survival", "r_automation", "r_nano", "r_gene"],
    { u_auto: 3 },
    { ru_s_breed: 3, ru_s_tide: 2, ru_s_acid: 1 },
    { cu_forge: 3, cu_anchor: 1 }],
  ["psionic-end", "psionic",
    { b_solar: 40, b_fossil: 20, b_fission: 8, b_monolith: 12, b_quantum: 3 },
    ["r_command", "r_survival", "r_solar2", "r_nuclear", "r_automation", "r_ai", "r_psy", "r_antimatter"],
    { u_click: 5, u_auto: 4, u_crit: 3 },
    { ru_p_seer: 4, ru_p_void: 3, ru_p_warp: 2 },
    { cu_ember: 4, cu_palace: 2 }],
];

const cases = scenarios.map(([name, route, buildings, research, clickUp, routeUp, coreUp]) => {
  const s = state(route, buildings, research, clickUp, routeUp, coreUp);
  const d = E.computeDerived(s);
  return {
    name,
    save: s,
    rates: d.rates,
    clickPower: d.clickPower,
    autoClicks: d.autoClicks,
    autoRate: d.autoRate,
    crit: d.crit,
  };
});

// —— 离线收益用例(30 分钟,处于倒计时内,与 Go ExpectedGains 长窗口径一致) ——
const offlineSave = state(
  "machine",
  { b_solar: 30, b_fossil: 12, b_lab: 4, b_quantum: 2, b_datacore: 7 },
  ["r_command", "r_survival", "r_solar2", "r_nuclear", "r_automation", "r_ai", "r_orbital"],
  { u_click: 3, u_auto: 2, u_crit: 1 },
  { ru_m_furnace: 2, ru_m_drone: 1 },
  { cu_ember: 2 },
);
offlineSave.lastTickAt = t0;
const offNow = t0 + 1_800_000; // +30min < 3600s 截止
const offSnapshot = structuredClone(offlineSave);
const offRes = E.applyOffline(offlineSave, offNow);

// —— 星核结算用例 ——
const escSave = state("machine", { b_solar: 30 }, ["r_command"], {}, {}, null);
const rEscape = E.computeReward(escSave, true, t0 + 1_800_000); // 剩余 30min → time=3
const diedSave = state("machine",
  { b_solar: 30, b_fossil: 12, b_lab: 4, b_quantum: 2, b_datacore: 7 },
  ["r_command", "r_survival", "r_solar2", "r_nuclear", "r_automation", "r_ai", "r_orbital"],
  { u_click: 3, u_auto: 2, u_crit: 1 }, { ru_m_furnace: 2, ru_m_drone: 1 }, { cu_ember: 2 });
diedSave.run.stats.energyTotal = 123_456_789;
const rDied = E.computeReward(diedSave, false, diedSave.run.deadlineAt + 1000); // 毁灭结算

// —— 成本公式用例 ——
const costs = [
  { name: "b_fossil@7", kind: "scaleCost", base: { energy: 110, material: 12 }, scale: 1.15, owned: 7,
    expect: E.scaleCost({ energy: 110, material: 12 }, 1.15, 7), scalar: 0 },
  { name: "b_solar@0", kind: "scaleCost", base: { energy: 15 }, scale: 1.15, owned: 0,
    expect: E.scaleCost({ energy: 15 }, 1.15, 0), scalar: 0 },
  { name: "b_antimatter@13", kind: "scaleCost", base: { energy: 520000, material: 7000 }, scale: 1.18, owned: 13,
    expect: E.scaleCost({ energy: 520000, material: 7000 }, 1.18, 13), scalar: 0 },
  { name: "u_click@9", kind: "specialCost", base: { energy: 40 }, scale: 3.1, owned: 9, expect: {}, scalar: E.specialCost(40, 3.1, 9) },
  { name: "ru_s_breed@4", kind: "specialCost", base: { energy: 45 }, scale: 1.85, owned: 4, expect: {}, scalar: E.specialCost(45, 1.85, 4) },
  { name: "cu_palace@5", kind: "coreCost", base: { energy: 6 }, scale: 4, owned: 5, expect: {}, scalar: E.coreCost(6, 4, 5) },
];

const fixture = {
  generatedAt: new Date().toISOString(),
  engine: "src/game/engine.ts",
  cases,
  offline: { save: offSnapshot, now: offNow, lastTickAt: t0, gains: offRes.gains, seconds: offRes.seconds },
  rewards: [
    { name: "escape-30min", save: escSave, escaped: true, now: t0 + 1_800_000, total: rEscape.total },
    { name: "died-123M", save: diedSave, escaped: false, now: diedSave.run.deadlineAt + 1000, total: rDied.total },
  ],
  costs,
};

mkdirSync("server/internal/engine/testdata", { recursive: true });
writeFileSync("server/internal/engine/testdata/fixture.json", JSON.stringify(fixture, null, 1));
console.log(
  `fixture.json 已生成: ${cases.length} 派生用例, ` +
  `${fixture.rewards.length} 结算用例, ${costs.length} 成本用例, 1 离线用例 ` +
  `(离线 ${offRes.seconds}s, 星核 ${rEscape.total}/${rDied.total})`,
);
