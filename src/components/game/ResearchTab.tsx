import { Check, Lock, FlaskConical } from "lucide-react";
import { ERAS, RESEARCH, RESEARCH_MAP, RES_META, effectText, type ResearchDef } from "@/game/config";
import * as E from "@/game/engine";
import { fmt } from "@/game/fmt";
import { useGame } from "@/game/store";
import type { SaveState } from "@/game/engine";

function CostLine({ def, save }: { def: ResearchDef; save: SaveState }) {
  const parts: Array<[keyof typeof RES_META, number]> = [];
  if (def.cost.research) parts.push(["research", def.cost.research]);
  if (def.cost.material) parts.push(["material", def.cost.material]);
  if (def.cost.energy) parts.push(["energy", def.cost.energy]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.map(([k, v]) => {
        const ok = save.run.res[k] >= v;
        return (
          <span
            key={k}
            className={`num rounded border px-1.5 py-0.5 text-[10px] ${ok ? "border-white/10 bg-white/5" : "border-red-400/30 bg-red-500/10 text-red-300"}`}
            style={{ color: ok ? RES_META[k].color : undefined }}
          >
            {fmt(v)} {RES_META[k].name}
          </span>
        );
      })}
    </div>
  );
}

function NodeCard({ def }: { def: ResearchDef }) {
  const save = useGame((s) => s.save);
  const buyResearch = useGame((s) => s.buyResearch);
  if (!save) return null;
  const state = E.researchAvailable(def.id, save);
  const afford = E.canAfford(save, def.cost);
  const effects = def.effects.flatMap((e) => effectText(e));

  return (
    <div
      className={`panel relative flex flex-col rounded-lg p-4 transition ${
        state === "done" ? "!border-emerald-400/25" : state === "open" ? "hover:!border-cyan-300/30" : "opacity-55"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`grid size-7 place-items-center rounded border ${
              state === "done"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : state === "open"
                  ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-600"
            }`}
          >
            {state === "done" ? <Check className="size-3.5" /> : state === "open" ? <FlaskConical className="size-3.5" /> : <Lock className="size-3.5" />}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100">{def.name}</div>
            <div className="num text-[9px] tracking-widest text-slate-600">{def.id.toUpperCase()}</div>
          </div>
        </div>
        {state === "done" && <span className="num rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-300">已完成</span>}
      </div>

      <p className="mt-2 min-h-8 text-[11px] leading-4.5 text-slate-400">{def.desc}</p>
      {def.quote && <p className="mt-1 text-[11px] italic text-cyan-300/70">「{def.quote}」</p>}

      {/* 前置 */}
      {def.req.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-slate-600">前置:</span>
          {def.req.map((q) => {
            const done = save.run.research[q];
            return (
              <span key={q} className={`num rounded border px-1.5 py-0.5 text-[9px] ${done ? "border-emerald-400/25 text-emerald-300/80" : "border-white/10 text-slate-500"}`}>
                {done ? "✓ " : ""}
                {RESEARCH_MAP.get(q)?.name ?? q}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {effects.map((t, i) => (
          <span key={i} className="rounded bg-cyan-400/8 px-1.5 py-0.5 text-[10px] text-cyan-200/90">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {state === "done" ? (
          <span className="text-[11px] text-slate-600">该科技已并入方舟数据库</span>
        ) : state === "open" ? (
          <>
            <CostLine def={def} save={save} />
            <button
              onClick={() => buyResearch(def.id)}
              disabled={!afford}
              className={`num shrink-0 rounded border px-3 py-1.5 text-[11px] font-bold tracking-wider transition ${
                afford ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20" : "border-white/10 text-slate-600"
              }`}
            >
              研究
            </button>
          </>
        ) : (
          <span className="text-[11px] text-slate-600">路径未解锁</span>
        )}
      </div>
    </div>
  );
}

export default function ResearchTab() {
  const save = useGame((s) => s.save);
  if (!save) return null;
  return (
    <div className="space-y-6">
      {ERAS.map((era, idx) => {
        const list = RESEARCH.filter((r) => r.era === idx);
        if (list.length === 0) return null;
        // 纪元是否初见端倪:前纪元任一项完成或本纪元有可研究项
        const visible = idx === 0 || list.some((r) => E.researchAvailable(r.id, save) !== "locked") || RESEARCH.filter((r) => r.era === idx - 1).some((r) => save.run.research[r.id]);
        if (!visible) return null;
        const doneCount = list.filter((r) => save.run.research[r.id]).length;
        return (
          <section key={era.en}>
            <div className="panel mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-4 py-3">
              <span className="disp text-base font-bold tracking-wider text-slate-100">{era.name}</span>
              <span className="num text-[9px] tracking-[0.3em] text-cyan-300/60">{era.en}</span>
              <span className="text-[11px] italic text-slate-500">{era.flavor}</span>
              <span className="num ml-auto text-[10px] text-slate-500">
                {doneCount}/{list.length}
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => (
                <NodeCard key={r.id} def={r} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
