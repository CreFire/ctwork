import { Zap, Package, FlaskConical, Volume2, VolumeX, LogOut, Rocket, Cpu, Dna, Eye, Sparkles } from "lucide-react";
import { fmt, fmtRate } from "@/game/fmt";
import { ROUTE_MAP } from "@/game/config";
import { useGame } from "@/game/store";

function ResChip({
  icon,
  name,
  value,
  rate,
  color,
}: {
  icon: React.ReactNode;
  name: string;
  value: number;
  rate: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] px-3 py-1.5">
      <span style={{ color }}>{icon}</span>
      <div className="leading-tight">
        <div className="text-[9px] tracking-wider text-slate-500">{name}</div>
        <div className="num text-[13px] font-semibold" style={{ color }}>
          {fmt(value)}
          <span className="ml-1.5 text-[10px] font-normal text-slate-500">+{fmtRate(rate)}</span>
        </div>
      </div>
    </div>
  );
}

export default function TopBar() {
  const save = useGame((s) => s.save);
  const derived = useGame((s) => s.derived);
  const user = useGame((s) => s.user);
  const dirtyAt = useGame((s) => s.syncDirtyAt);
  const savedAt = useGame((s) => s.syncSavedAt);
  const muted = useGame((s) => s.muted);
  const setMuted = useGame((s) => s.setMuted);
  const logout = useGame((s) => s.logout);
  if (!save || !derived) return null;

  const route = save.run.route ? ROUTE_MAP.get(save.run.route) : null;
  const specialIcon = save.run.route === "machine" ? <Cpu className="size-4" /> : save.run.route === "swarm" ? <Dna className="size-4" /> : <Eye className="size-4" />;
  const synced = savedAt >= dirtyAt;

  return (
    <header className="sticky top-0 z-40 border-b border-cyan-300/10 bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded border border-cyan-300/30 bg-cyan-400/10">
            <Rocket className="size-4 text-cyan-300" />
          </div>
          <div className="leading-tight">
            <div className="disp text-[13px] font-bold tracking-[0.22em] text-cyan-100">方舟纪元</div>
            <div className="num text-[9px] tracking-widest text-slate-500">
              RUN #{save.run.runId} · 第{save.run.runId}纪元
            </div>
          </div>
        </div>

        <div className="mx-1 h-8 w-px bg-white/8" />

        <div className="scroll-slim flex items-center gap-2 overflow-x-auto">
          <ResChip icon={<Zap className="size-4" />} name="能量 ENERGY" value={save.run.res.energy} rate={derived.rates.energy + derived.autoRate} color="#22d3ee" />
          <ResChip icon={<Package className="size-4" />} name="物资 MATERIAL" value={save.run.res.material} rate={derived.rates.material} color="#f59e0b" />
          <ResChip icon={<FlaskConical className="size-4" />} name="科研 SCIENCE" value={save.run.res.research} rate={derived.rates.research} color="#4ade80" />
          {route && (
            <ResChip icon={specialIcon} name={`${route.specialName} ${route.specialEn}`} value={save.run.res.special} rate={derived.rates.special} color="#a78bfa" />
          )}
          <div className="flex items-center gap-2 rounded-md border border-violet-300/20 bg-violet-400/10 px-3 py-1.5">
            <Sparkles className="size-4 text-violet-300" />
            <div className="leading-tight">
              <div className="text-[9px] tracking-wider text-violet-300/70">星核 STELLAR</div>
              <div className="num text-[13px] font-semibold text-violet-200">{save.meta.cores}</div>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className={`num hidden items-center gap-1.5 rounded border px-2 py-1 text-[10px] sm:flex ${synced ? "border-emerald-400/20 text-emerald-300/80" : "border-amber-400/20 text-amber-300/90"}`}>
            <span className={`size-1.5 rounded-full ${synced ? "bg-emerald-400" : "bg-amber-400 pulse-soft"}`} />
            {synced ? "已同步" : "同步中…"}
          </div>
          <button
            onClick={() => setMuted(!muted)}
            className="grid size-8 place-items-center rounded border border-white/10 bg-white/[0.03] text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200"
            title={muted ? "开启音效" : "静音"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <div className="hidden items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 md:flex">
            <span className="size-1.5 rounded-full bg-cyan-300" />
            <span className="num text-[11px] text-slate-300">{user?.account}</span>
            <span className="num text-[9px] text-slate-600">{user?.uid}</span>
          </div>
          <button
            onClick={logout}
            className="grid size-8 place-items-center rounded border border-white/10 bg-white/[0.03] text-slate-400 transition hover:border-red-300/40 hover:text-red-300"
            title="断开连接"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
