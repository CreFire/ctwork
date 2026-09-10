import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, MousePointerClick, Bot, Crosshair } from "lucide-react";
import { CLICK_UPGRADES, GLOBAL, RES_META } from "@/game/config";
import { fmt } from "@/game/fmt";
import { useGame } from "@/game/store";

interface Spark {
  id: number;
  x: number;
  amount: number;
  crit: boolean;
}
let sparkSeq = 0;

export default function EnergyTab() {
  const save = useGame((s) => s.save);
  const derived = useGame((s) => s.derived);
  const clickCore = useGame((s) => s.clickCore);
  const buyClickUp = useGame((s) => s.buyClickUp);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [pulse, setPulse] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  if (!save || !derived) return null;

  const onClick = (e: React.MouseEvent) => {
    const r = clickCore();
    if (!r) return;
    const rect = areaRef.current?.getBoundingClientRect();
    const id = ++sparkSeq;
    const x = rect ? e.clientX - rect.left - 80 + (Math.random() - 0.5) * 60 : 100;
    setSparks((s) => [...s.slice(-14), { id, x, amount: r.amount, crit: r.crit }]);
    setPulse((p) => p + 1);
    setTimeout(() => setSparks((s) => s.filter((k) => k.id !== id)), 950);
  };

  const icons = [<MousePointerClick key="a" className="size-4.5" />, <Bot key="b" className="size-4.5" />, <Crosshair key="c" className="size-4.5" />];

  return (
    <div className="space-y-4">
      {/* 核心点击区 */}
      <div ref={areaRef} className="panel relative overflow-hidden rounded-lg px-6 py-10">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(60%_60%_at_50%_45%,rgba(34,211,238,0.12),transparent_70%)]" />
        {/* 浮动火花 */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <AnimatePresence>
            {sparks.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 1, y: 0, x: s.x, scale: s.crit ? 1.35 : 1 }}
                animate={{ opacity: 0, y: -110 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className={`num absolute left-1/2 top-[38%] text-lg font-bold ${s.crit ? "text-amber-300" : "text-cyan-200"}`}
                style={{ textShadow: s.crit ? "0 0 18px rgba(251,191,36,0.8)" : "0 0 14px rgba(34,211,238,0.7)" }}
              >
                +{fmt(s.amount)}
                {s.crit && <span className="ml-1 text-xs">暴击!</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="hud-tag mb-6">REACTOR CORE · 应急能源核心</div>
          <button onClick={onClick} className="relative grid size-52 select-none place-items-center rounded-full outline-none md:size-60" aria-label="点击采集能量">
            <span className="core-ring absolute inset-0 rounded-full opacity-80" style={{ mask: "radial-gradient(closest-side, transparent 78%, black 80%)", WebkitMask: "radial-gradient(closest-side, transparent 78%, black 80%)" }} />
            <span className="core-ring2 absolute inset-2 rounded-full" style={{ mask: "radial-gradient(closest-side, transparent 82%, black 84%)", WebkitMask: "radial-gradient(closest-side, transparent 82%, black 84%)" }} />
            <motion.span
              key={pulse}
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: 1.12, opacity: 0 }}
              transition={{ duration: 0.55 }}
              className="absolute inset-6 rounded-full border border-cyan-300/40"
            />
            <span className="core-body relative grid size-44 place-items-center rounded-full border border-cyan-200/25 md:size-52">
              <span className="flex flex-col items-center gap-1.5">
                <Zap className="size-9 text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                <span className="num text-xs tracking-[0.3em] text-cyan-200/80">TAP</span>
                <span className="num text-[13px] font-bold text-cyan-100">+{fmt(derived.clickPower)}</span>
              </span>
            </span>
          </button>

          <div className="mt-7 grid w-full max-w-lg grid-cols-3 gap-3 text-center">
            <div className="rounded-md border border-white/8 bg-white/[0.03] py-2.5">
              <div className="text-[10px] text-slate-500">点击产出</div>
              <div className="num text-sm font-bold text-cyan-200">{fmt(derived.clickPower)}</div>
            </div>
            <div className="rounded-md border border-white/8 bg-white/[0.03] py-2.5">
              <div className="text-[10px] text-slate-500">自动点击</div>
              <div className="num text-sm font-bold text-cyan-200">
                {derived.autoClicks}/s <span className="text-[10px] font-normal text-slate-500">≈+{fmt(derived.autoRate)}/s</span>
              </div>
            </div>
            <div className="rounded-md border border-white/8 bg-white/[0.03] py-2.5">
              <div className="text-[10px] text-slate-500">暴击率</div>
              <div className="num text-sm font-bold text-amber-300">
                {Math.round(derived.crit * 100)}% <span className="text-[10px] font-normal text-slate-500">×{GLOBAL.critMult}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 核心强化 */}
      <div className="grid gap-3 md:grid-cols-3">
        {CLICK_UPGRADES.map((def, i) => {
          const lvl = save.run.clickUp[def.id] ?? 0;
          const maxed = lvl >= def.max;
          const cost = Math.ceil(def.baseCost * Math.pow(def.scale, lvl));
          const afford = save.run.res.energy >= cost;
          return (
            <div key={def.id} className="panel flex flex-col rounded-lg p-4">
              <div className="flex items-center gap-2 text-cyan-200">
                {icons[i]}
                <span className="text-sm font-bold">{def.name}</span>
              </div>
              <p className="mt-1.5 min-h-8 text-[11px] leading-4 text-slate-500">{def.desc}</p>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: Math.min(def.max, 10) }).map((_, k) => (
                  <span key={k} className={`h-1 flex-1 rounded-full ${k < Math.min(lvl, 10) ? "bg-cyan-400" : "bg-white/10"}`} />
                ))}
                <span className="num ml-1.5 text-[10px] text-slate-500">
                  {lvl}/{def.max}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">{def.perText}</div>
              <button
                onClick={() => buyClickUp(def.id)}
                disabled={maxed || !afford}
                className={`num mt-3 rounded border px-3 py-2 text-xs font-bold tracking-wider transition ${
                  maxed
                    ? "border-white/10 text-slate-600"
                    : afford
                      ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
                      : "border-white/10 text-slate-600"
                }`}
              >
                {maxed ? "MAX" : `升级 · ${fmt(cost)} ${RES_META.energy.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
