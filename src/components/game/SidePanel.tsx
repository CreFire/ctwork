import { useMemo } from "react";
import { AlarmClock, Trophy, TerminalSquare } from "lucide-react";
import EarthCanvas from "@/components/EarthCanvas";
import { GLOBAL, LEADERBOARD_NAMES } from "@/game/config";
import { fmt, fmtClock } from "@/game/fmt";
import { useGame } from "@/game/store";
import type { Tone } from "@/game/store";

const TONE_CLASS: Record<Tone, string> = {
  info: "text-slate-400",
  success: "text-emerald-300",
  warn: "text-amber-300",
  danger: "text-red-300",
  story: "text-cyan-300/90 italic",
};

function hashStr(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Leaderboard() {
  const save = useGame((s) => s.save);
  const user = useGame((s) => s.user);
  const rows = useMemo(() => {
    if (!save || !user) return [];
    const mine = save.meta.totalEnergy + save.run.res.energy;
    const list = LEADERBOARD_NAMES.slice(0, 9).map((name, i) => {
      const h = hashStr(user.uid + name);
      const factor = 0.35 + ((h % 100) / 100) * 2.4 - i * 0.1;
      return { name, score: Math.max(1, mine * Math.max(0.05, factor)), me: false };
    });
    list.push({ name: `${user.account} (你)`, score: Math.max(1, mine), me: true });
    return list.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [save, user]);

  return (
    <div className="panel rounded-lg p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Trophy className="size-3.5 text-amber-300/80" />
        <span className="hud-tag">方舟网络 · 产能榜</span>
      </div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-[11px] ${r.me ? "bg-cyan-400/10 text-cyan-100" : "text-slate-500"}`}
          >
            <span className={`num w-4 text-[10px] ${i === 0 ? "text-amber-300" : r.me ? "text-cyan-300" : "text-slate-600"}`}>{i + 1}</span>
            <span className="flex-1 truncate">{r.name}</span>
            <span className="num">{r.score >= 10000 ? fmt(r.score) : Math.floor(r.score)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-600">联机 PvE 排行榜 · 模拟节点(正式赛季由 dueGame 集群结算)</p>
    </div>
  );
}

export default function SidePanel() {
  const save = useGame((s) => s.save);
  const now = useGame((s) => s.now);
  const logs = useGame((s) => s.logs);
  if (!save) return null;

  const remain = Math.max(0, (save.run.deadlineAt - now) / 1000);
  const total = Math.max(1, (save.run.deadlineAt - save.run.startedAt) / 1000);
  const progress = Math.min(1, Math.max(0, 1 - remain / total));
  const urgent = remain < 300;

  return (
    <aside className="space-y-4">
      {/* 倒计时 */}
      <div className={`panel rounded-lg p-4 ${urgent ? "urgent-pulse" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlarmClock className={`size-4 ${urgent ? "text-red-400" : "text-cyan-300/80"}`} />
            <span className="hud-tag">地球解体倒计时 · T-MINUS</span>
          </div>
          <span className="num text-[10px] text-slate-600">RUN #{save.run.runId}</span>
        </div>
        <div className={`num mt-2 text-center text-[42px] font-bold leading-none tracking-wide ${urgent ? "text-red-300" : "text-slate-100"}`}>
          {fmtClock(remain)}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className={`bar-shimmer h-full rounded-full transition-[width] duration-300 ${progress < 0.6 ? "bg-gradient-to-r from-cyan-500 to-cyan-300" : progress < 0.85 ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-red-600 to-red-400"}`}
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
        <div className="num mt-1.5 flex justify-between text-[10px] text-slate-600">
          <span>地核稳定度 {(100 - progress * 100).toFixed(1)}%</span>
          <span>逃生窗口 {fmtClock(remain)}</span>
        </div>
      </div>

      {/* 地球实况 */}
      <div className="panel rounded-lg p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="hud-tag">TERRA · 近地轨道实况</span>
          <span className="num text-[10px] text-slate-600">SAT-LINK 07</span>
        </div>
        <EarthCanvas progress={progress} size={280} />
        <p className={`mt-1 text-center text-[11px] ${urgent ? "text-red-300/90" : "text-slate-500"}`}>
          {progress < 0.35
            ? "母星暂时平静,地壳深处传来沉闷的轰鸣。"
            : progress < 0.6
              ? "火山带全面苏醒,大气中出现异常电暴。"
              : progress < 0.85
                ? "裂谷正在蔓延。海洋沸腾,大陆像枯叶一样卷曲。"
                : "最后的时刻。所有广播都已静默,只剩传感器在歌唱。"}
        </p>
      </div>

      {/* 日志 */}
      <div className="panel rounded-lg p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <TerminalSquare className="size-3.5 text-cyan-300/80" />
          <span className="hud-tag">方舟日志 · SYSTEM LOG</span>
        </div>
        <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {[...logs].reverse().map((l) => (
            <div key={l.id} className="rise-in flex gap-2 text-[11px] leading-4.5">
              <span className="num shrink-0 text-slate-600">
                {new Date(l.time).toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
              <span className={TONE_CLASS[l.tone]}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>

      <Leaderboard />

      <div className="num text-center text-[10px] leading-4 text-slate-700">
        TICK {GLOBAL.tickMs}ms · AUTOSAVE {GLOBAL.autosaveMs / 1000}s · 离线收益 {GLOBAL.offlineEfficiency * 100}% 上限 {GLOBAL.offlineCapHours}h
      </div>
    </aside>
  );
}
