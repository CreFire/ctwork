import { Lock, Zap, Package, FlaskConical, Hexagon } from "lucide-react";
import { BUILDINGS, GLOBAL, RES_META, type BuildingDef } from "@/game/config";
import * as E from "@/game/engine";
import { fmt, fmtRate } from "@/game/fmt";
import { useGame } from "@/game/store";
import type { SaveState } from "@/game/engine";

const CHAIN_META = {
  energy: { name: "能源设施", en: "ENERGY GRID", color: "#22d3ee", icon: Zap },
  material: { name: "物资工业", en: "INDUSTRY", color: "#f59e0b", icon: Package },
  research: { name: "科研体系", en: "SCIENCE", color: "#4ade80", icon: FlaskConical },
  special: { name: "路线造物", en: "ASCENSION", color: "#a78bfa", icon: Hexagon },
} as const;

function CostChips({ cost, save }: { cost: import("@/game/config").Cost; save: SaveState }) {
  const parts: Array<[keyof typeof cost, number]> = [];
  if (cost.energy) parts.push(["energy", cost.energy]);
  if (cost.material) parts.push(["material", cost.material]);
  if (cost.research) parts.push(["research", cost.research]);
  if (cost.special) parts.push(["special", cost.special]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.map(([k, v]) => {
        const ok = save.run.res[k as keyof SaveState["run"]["res"]] >= v;
        return (
          <span
            key={k}
            className={`num rounded border px-1.5 py-0.5 text-[10px] ${ok ? "border-white/10 bg-white/5" : "border-red-400/30 bg-red-500/10 text-red-300"}`}
            style={{ color: ok ? RES_META[k as keyof typeof RES_META].color : undefined }}
          >
            {fmt(v)} {RES_META[k as keyof typeof RES_META].name}
          </span>
        );
      })}
    </div>
  );
}

function BuildingCard({ def }: { def: BuildingDef }) {
  const save = useGame((s) => s.save);
  const buyBuilding = useGame((s) => s.buyBuilding);
  if (!save) return null;
  const unlocked = E.isBuildingUnlocked(def, save);
  const owned = save.run.buildings[def.id] ?? 0;
  const cost1 = E.scaleCost(def.baseCost, def.scale, owned);
  const resName = def.produces === "special" ? "特殊" : RES_META[def.produces].name;
  const resColor = def.produces === "special" ? "#a78bfa" : RES_META[def.produces].color;
  const milestone = GLOBAL.milestoneEvery;
  const mProg = owned % milestone;

  if (!unlocked) {
    return (
      <div className="panel relative flex flex-col rounded-lg p-4 opacity-60">
        <div className="flex items-center gap-2 text-slate-500">
          <Lock className="size-4" />
          <span className="text-sm font-bold">{def.name}</span>
          <span className="num text-[9px] tracking-widest text-slate-600">{def.en}</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {def.unlockRoute
            ? `需要选择科技路线「${def.unlockRoute === "machine" ? "机械飞升" : def.unlockRoute === "swarm" ? "蜂群意志" : "灵能升华"}」`
            : "需要完成前置科技研究"}
        </p>
      </div>
    );
  }

  const can1 = E.canAfford(save, cost1);

  return (
    <div className="panel flex flex-col rounded-lg p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-slate-100">{def.name}</span>
            <span className="num text-[9px] tracking-widest text-slate-600">{def.en}</span>
          </div>
          <div className="num mt-0.5 text-[10px]" style={{ color: resColor }}>
            单体 {fmtRate(def.perSec)} {resName}
            {owned > 0 && <span className="text-slate-500"> · 合计 {fmtRate(owned * def.perSec * Math.pow(GLOBAL.milestoneMult, Math.floor(owned / milestone)))}</span>}
          </div>
        </div>
        <div className="num text-2xl font-bold text-slate-200">{owned}</div>
      </div>
      <p className="mt-1.5 min-h-7 text-[11px] leading-3.5 text-slate-500">{def.desc}</p>
      {/* 里程碑 */}
      <div className="mt-2">
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>里程碑 ×{GLOBAL.milestoneMult} / {milestone}座</span>
          <span className="num">
            {mProg}/{milestone}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${(mProg / milestone) * 100}%` }} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <CostChips cost={cost1} save={save} />
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => buyBuilding(def.id, 1)}
            disabled={!can1}
            className={`num rounded border px-2.5 py-1.5 text-[11px] font-bold transition ${can1 ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/25" : "border-white/10 text-slate-600"}`}
          >
            +1
          </button>
          <button
            onClick={() => buyBuilding(def.id, 10)}
            disabled={!can1}
            className={`num rounded border px-2.5 py-1.5 text-[11px] font-bold transition ${can1 ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/25" : "border-white/10 text-slate-600"}`}
          >
            +10
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BuildTab() {
  const save = useGame((s) => s.save);
  if (!save) return null;
  const chains: Array<keyof typeof CHAIN_META> = ["energy", "material", "research", "special"];
  return (
    <div className="space-y-5">
      {chains.map((chain) => {
        const list = BUILDINGS.filter((b) => b.chain === chain);
        if (chain === "special" && !save.run.route) return null;
        const meta = CHAIN_META[chain];
        const Icon = meta.icon;
        return (
          <section key={chain}>
            <div className="mb-2.5 flex items-center gap-2">
              <Icon className="size-4" style={{ color: meta.color }} />
              <span className="text-sm font-bold text-slate-200">{meta.name}</span>
              <span className="num text-[9px] tracking-[0.25em] text-slate-600">{meta.en}</span>
              <span className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((b) => (
                <BuildingCard key={b.id} def={b} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
