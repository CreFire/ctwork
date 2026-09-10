import { Rocket, Check, X, Sparkles, CircleAlert } from "lucide-react";
import { CORE_UPGRADES, GLOBAL } from "@/game/config";
import * as E from "@/game/engine";
import { fmt } from "@/game/fmt";
import { useGame } from "@/game/store";

export default function LaunchTab() {
  const save = useGame((s) => s.save);
  const now = useGame((s) => s.now);
  const launch = useGame((s) => s.launch);
  const buyCoreUp = useGame((s) => s.buyCoreUp);
  if (!save) return null;

  const ready = E.launchReady(save);
  const reward = E.computeReward(save, true, now);
  const remain = Math.max(0, (save.run.deadlineAt - now) / 1000);

  const checks = [
    { label: "完成科技「曲率引擎」", done: !!save.run.research["r_engine"], cur: save.run.research["r_engine"] ? "已就绪" : "未完成", req: 1, val: save.run.research["r_engine"] ? 1 : 0 },
    { label: `引擎充能 ≥ ${fmt(GLOBAL.launchEnergyReq)} 能量`, done: save.run.res.energy >= GLOBAL.launchEnergyReq, cur: fmt(save.run.res.energy), req: GLOBAL.launchEnergyReq, val: Math.min(save.run.res.energy, GLOBAL.launchEnergyReq) },
    { label: `舰体工单 ≥ ${fmt(GLOBAL.launchMaterialReq)} 物资`, done: save.run.res.material >= GLOBAL.launchMaterialReq, cur: fmt(save.run.res.material), req: GLOBAL.launchMaterialReq, val: Math.min(save.run.res.material, GLOBAL.launchMaterialReq) },
  ];

  return (
    <div className="space-y-5">
      {/* 发射程序 */}
      <div className="panel relative overflow-hidden rounded-lg p-6">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(70%_80%_at_50%_0%,rgba(167,139,250,0.14),transparent_70%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <Rocket className="size-5 text-violet-300" />
            <div>
              <div className="text-base font-black text-slate-100">方舟发射程序</div>
              <div className="num text-[9px] tracking-[0.3em] text-slate-600">IGNITION SEQUENCE · PROJECT ARK</div>
            </div>
            <div className="num ml-auto rounded border border-violet-300/25 bg-violet-400/10 px-3 py-1.5 text-[11px] text-violet-200">
              预计奖励:<span className="font-bold">星核 ×{reward.total}</span>
              <span className="ml-2 text-[9px] text-slate-500">基础{reward.base} + 产能{reward.production} + 时间{reward.time}</span>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${c.done ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300" : "border-white/15 text-slate-600"}`}>
                  {c.done ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span className={`flex-1 text-[12px] ${c.done ? "text-slate-300" : "text-slate-500"}`}>{c.label}</span>
                <span className="num text-[11px] text-slate-500">{c.cur}</span>
                <div className="hidden h-1 w-28 overflow-hidden rounded-full bg-white/5 sm:block">
                  <div className={`h-full rounded-full ${c.done ? "bg-emerald-400" : "bg-cyan-400/60"}`} style={{ width: `${(c.val / c.req) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={launch}
            disabled={!ready.ok}
            className={`disp mt-6 w-full rounded border py-4 text-lg font-bold tracking-[0.35em] transition ${
              ready.ok
                ? "border-orange-300/50 bg-gradient-to-r from-orange-500/25 via-red-500/25 to-orange-500/25 text-orange-100 hover:shadow-[0_0_40px_rgba(249,115,22,0.35)]"
                : "cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-600"
            }`}
          >
            {ready.ok ? "点 火 · IGNITE" : "引擎未就绪"}
          </button>

          <div className="mt-3 flex items-start gap-2 text-[11px] leading-4.5 text-slate-500">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-300/70" />
            <p>
              点火后本轮纪元结束:方舟携带星核跃迁,进入新的轮回。剩余时间({Math.floor(remain)} 秒)与累计产能都会转化为奖励。
              若倒计时归零仍未逃离,地球将毁灭,逃生舱只能带回少量星核。星核用于下方「永恒遗产」,永久生效于所有轮回。
            </p>
          </div>
        </div>
      </div>

      {/* 星核遗产 */}
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <Sparkles className="size-4 text-violet-300" />
          <span className="text-sm font-bold text-slate-200">永恒遗产</span>
          <span className="num text-[10px] text-violet-300">可用星核:{save.meta.cores}</span>
          <span className="text-[10px] text-slate-600">跨轮回永久生效</span>
          <span className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CORE_UPGRADES.map((u) => {
            const lvl = save.meta.coreUp[u.id] ?? 0;
            const maxed = lvl >= u.max;
            const cost = E.coreCost(u.base, u.inc, lvl);
            const afford = save.meta.cores >= cost;
            return (
              <div key={u.id} className="panel flex flex-col rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-violet-200">{u.name}</span>
                  <span className="num text-[10px] text-slate-500">
                    {lvl}/{u.max}
                  </span>
                </div>
                <p className="mt-1.5 flex-1 text-[11px] leading-4 text-slate-400">{u.desc}</p>
                <div className="mt-2 flex items-center gap-1">
                  {Array.from({ length: Math.min(u.max, 10) }).map((_, k) => (
                    <span key={k} className={`h-1 flex-1 rounded-full ${k < Math.min(lvl, 10) ? "bg-violet-400" : "bg-white/8"}`} />
                  ))}
                </div>
                <button
                  onClick={() => buyCoreUp(u.id)}
                  disabled={maxed || !afford}
                  className={`num mt-3 rounded border px-2 py-2 text-[11px] font-bold tracking-wider transition ${
                    maxed ? "border-white/10 text-slate-600" : afford ? "border-violet-300/45 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20" : "border-white/10 text-slate-600"
                  }`}
                >
                  {maxed ? "MAX" : `回响 · ${cost} 星核`}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
