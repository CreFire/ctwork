import { Check, Cpu, Dna, Eye, Lock, RefreshCcw } from "lucide-react";
import { RESEARCH_MAP, ROUTES, ROUTE_UPGRADES, type RouteDef } from "@/game/config";
import * as E from "@/game/engine";
import { fmt } from "@/game/fmt";
import { useGame } from "@/game/store";

const ROUTE_STYLE: Record<string, { color: string; icon: typeof Cpu }> = {
  machine: { color: "#38bdf8", icon: Cpu },
  swarm: { color: "#4ade80", icon: Dna },
  psionic: { color: "#a78bfa", icon: Eye },
};

function RouteCard({ def }: { def: RouteDef }) {
  const save = useGame((s) => s.save);
  const chooseRoute = useGame((s) => s.chooseRoute);
  const cancelRoute = useGame((s) => s.cancelRoute);
  const pending = useGame((s) => s.pendingRoute);
  if (!save) return null;
  const st = ROUTE_STYLE[def.id];
  const Icon = st.icon;
  const unlocked = !!save.run.research[def.requireResearch];
  const active = save.run.route === def.id;
  const isPending = pending === def.id;

  return (
    <div
      className="panel relative flex flex-col overflow-hidden rounded-lg p-5 transition"
      style={active ? { borderColor: `${st.color}55`, boxShadow: `0 0 34px ${st.color}18 inset, 0 0 22px ${st.color}0d` } : undefined}
    >
      {active && <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${st.color}, transparent)` }} />}
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-lg border" style={{ borderColor: `${st.color}44`, background: `${st.color}14` }}>
          <Icon className="size-5.5" style={{ color: st.color }} />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black" style={{ color: st.color }}>
              {def.name}
            </span>
            <span className="text-[11px] text-slate-400">{def.title}</span>
          </div>
          <div className="num text-[9px] tracking-[0.25em] text-slate-600">{def.en}</div>
        </div>
        {active && (
          <span className="ml-auto rounded border px-2 py-1 text-[10px] font-bold" style={{ borderColor: `${st.color}55`, color: st.color }}>
            当前路线
          </span>
        )}
      </div>

      <p className="mt-3 text-[12px] leading-5 text-slate-400">{def.desc}</p>
      <ul className="mt-3 space-y-1.5">
        {def.perks.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[11px] text-slate-400">
            <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: st.color }} />
            {p}
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-3">
        {!unlocked ? (
          <div className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-slate-500">
            <Lock className="size-3.5" />
            需要科技「{RESEARCH_MAP.get(def.requireResearch)?.name}」
          </div>
        ) : active ? (
          <div className="text-[11px] text-slate-500">
            专属资源:<span style={{ color: st.color }}>{def.specialName}</span> 正在汇聚 → 前往「建设」页建造路线造物
          </div>
        ) : isPending ? (
          <div className="space-y-2">
            <p className="text-[11px] leading-4 text-amber-300/90">切换路线将重置当前路线的专属资源与升级,确认?</p>
            <div className="flex gap-2">
              <button onClick={() => chooseRoute(def.id, true)} className="num flex-1 rounded border border-red-400/40 bg-red-500/10 py-2 text-[11px] font-bold text-red-200 hover:bg-red-500/20">
                确认切换
              </button>
              <button onClick={cancelRoute} className="num flex-1 rounded border border-white/15 py-2 text-[11px] font-bold text-slate-300 hover:bg-white/5">
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => chooseRoute(def.id)}
            className="num flex w-full items-center justify-center gap-2 rounded border py-2.5 text-xs font-bold tracking-widest transition hover:opacity-90"
            style={{ borderColor: `${st.color}55`, background: `${st.color}14`, color: st.color }}
          >
            {save.run.route ? (
              <>
                <RefreshCcw className="size-3.5" /> 切换至此路线
              </>
            ) : (
              "确立文明路线"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function RoutesTab() {
  const save = useGame((s) => s.save);
  const buyRouteUp = useGame((s) => s.buyRouteUp);
  if (!save) return null;
  const route = save.run.route;
  const routeDef = route ? ROUTES.find((r) => r.id === route) : null;
  const st = route ? ROUTE_STYLE[route] : null;

  return (
    <div className="space-y-5">
      <div className="panel rounded-lg px-5 py-4">
        <div className="hud-tag mb-1">ASCENSION PATH · 飞升路线</div>
        <p className="text-[12px] leading-5 text-slate-400">
          人类文明将以何种形态离开太阳系?在科技树中完成 <span className="text-cyan-300">强人工智能 / 基因飞升 / 意识解码</span> 即可解锁对应路线。
          路线决定你的专属资源与升级体系;切换路线免费,但专属进度会重置——每个新纪元都可以重新抉择。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
        {ROUTES.map((r) => (
          <RouteCard key={r.id} def={r} />
        ))}
      </div>

      {route && routeDef && st && (
        <section>
          <div className="mb-2.5 flex items-center gap-2">
            <st.icon className="size-4" style={{ color: st.color }} />
            <span className="text-sm font-bold text-slate-200">{routeDef.name} · 专属升级</span>
            <span className="num text-[10px]" style={{ color: st.color }}>
              当前{routeDef.specialName}:{fmt(save.run.res.special)}
            </span>
            <span className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ROUTE_UPGRADES.filter((u) => u.route === route).map((u) => {
              const lvl = save.run.routeUp[u.id] ?? 0;
              const maxed = lvl >= u.max;
              const cost = E.specialCost(u.baseCost, u.scale, lvl);
              const afford = save.run.res.special >= cost;
              return (
                <div key={u.id} className="panel flex flex-col rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: st.color }}>
                      {u.name}
                    </span>
                    <span className="num text-[10px] text-slate-500">
                      {lvl}/{u.max}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {Array.from({ length: u.max }).map((_, k) => (
                      <span key={k} className="h-1 flex-1 rounded-full" style={{ background: k < lvl ? st.color : "rgba(255,255,255,0.08)" }} />
                    ))}
                  </div>
                  <p className="mt-2 flex-1 text-[11px] text-slate-400">{u.desc}</p>
                  <button
                    onClick={() => buyRouteUp(u.id)}
                    disabled={maxed || !afford}
                    className={`num mt-2 rounded border px-2 py-1.5 text-[11px] font-bold transition ${maxed ? "border-white/10 text-slate-600" : afford ? "" : "border-white/10 text-slate-600"}`}
                    style={!maxed && afford ? { borderColor: `${st.color}55`, background: `${st.color}14`, color: st.color } : undefined}
                  >
                    {maxed ? "MAX" : `升级 · ${fmt(cost)} ${routeDef.specialName}`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
