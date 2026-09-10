#!/usr/bin/env node
/**
 * 引擎冒烟测试(无需 Go / 无需浏览器)
 *
 *   用法: npm run smoke
 *
 * 用 esbuild 把 src/game/config.ts + engine.ts 打包后在 Node 里真实执行:
 * 校验 Luban 配置装载(来源/健康度/各表行数)、并跑一遍
 * 「新档 → 建造 → 研究 → 派生 → tick → 离线结算 → 星核 → 编年史/墓碑」闭环。
 * 配置表若缺字段或数值非法,这里会先于玩家发现。
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// 浏览器 API 最小桩(jsdom 不可用时)
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.AudioContext = class { constructor() { this.state = "suspended"; } resume() {} createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: "" }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; } get destination() { return {}; } get currentTime() { return 0; } };

await build({
  entryPoints: ["src/game/config.ts", "src/game/engine.ts"],
  bundle: true, platform: "node", format: "cjs", outdir: ".arena-tmp/smoke", outExtension: { ".js": ".cjs" },
  logLevel: "silent", absWorkingDir: process.cwd(),
});
const require2 = createRequire(import.meta.url);
const C = require2(resolve(".arena-tmp/smoke/config.cjs"));
const E = require2(resolve(".arena-tmp/smoke/engine.cjs"));

const health = C.getConfigHealth();
console.log("[smoke] 配置来源:", health.source, "| ok:", health.ok, "| errors:", health.errors.length, "| warnings:", health.warnings.length);
if (!health.ok) { console.error(health.errors); process.exit(1); }
console.log("[smoke] 表规模: 建筑", C.BUILDINGS.length, "科技", C.RESEARCH.length, "路线升级", C.ROUTE_UPGRADES.length, "星核", C.CORE_UPGRADES.length, "事件", C.RANDOM_EVENTS.length, "剧情", C.STORY_EVENTS.length, "纪元", C.ERAS.length, "榜名", C.LEADERBOARD_NAMES.length);
console.log("[smoke] GLOBAL: 倒计时", C.GLOBAL.earthCountdownSeconds, "s | 首个事件", C.GLOBAL.firstEventDelaySeconds, "s | 自动存档", C.GLOBAL.autosaveMs, "ms | 补给舱", C.GLOBAL.crateMinGainSeconds, "s");

// 走一遍完整轮回逻辑:新档 → 造建筑 → 研究 → 派生 → 离线 → 结算 → 编年史
const t0 = 1_700_000_000_000;
const save = E.newSave("smoke", t0);
save.run.buildings.b_solar = 30;
save.run.buildings.b_fossil = 12;
save.run.research.r_command = true;
save.run.research.r_ai = true;
save.run.route = "machine";
save.run.buildings.b_datacore = 5;
const d = E.computeDerived(save);
console.log("[smoke] 产出/秒:", JSON.stringify(d.rates), "| 点击力", d.clickPower, "| 暴击", d.crit);
E.applyTick(save, d, 60);
console.log("[smoke] tick 60s 后能量:", Math.round(save.run.res.energy));
const off = E.applyOffline(save, t0 + 1_800_000);
console.log("[smoke] 离线 30min: 秒数", off.seconds, "收益", JSON.stringify(Object.fromEntries(Object.entries(off.gains).map(([k, v]) => [k, Math.round(v)]))));
const reward = E.computeReward(save, true, t0 + 1_800_000);
console.log("[smoke] 逃逸结算星核:", reward.total, JSON.stringify(reward));
const rec = E.makeRunRecord(save, false, reward, t0 + 1_800_000);
rec.epitaph = E.epitaphFor(rec);
E.pushHistory(save.meta, rec);
console.log("[smoke] 编年史落笔: 纪元", rec.era, "| 建筑", rec.buildingsTotal, "| 科技", rec.researchCount, "| 墓志铭「" + rec.epitaph + "」 | history", save.meta.history.length);
if (save.meta.history.length !== 1 || !rec.epitaph) { console.error("编年史写入失败"); process.exit(1); }
console.log("[smoke] ✅ 通过");
