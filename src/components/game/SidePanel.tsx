import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Trophy, TerminalSquare, RefreshCw, Wifi, WifiOff, Crown, Rocket, Skull } from "lucide-react";
import EarthCanvas from "@/components/EarthCanvas";
import { GLOBAL } from "@/game/config";
import { fmt, fmtClock } from "@/game/fmt";
import { useGame } from "@/game/store";
import { useLeague } from "@/game/leagueStore";
import type { Tone } from "@/game/store";
import { isRealApi } from "@/services/api";

const TONE_CLASS: Record<Tone, string> = {
  info: "text-slate-400",
  success: "text-emerald-300",
  warn: "text-amber-300",
  danger: "text-red-300",
  story: "text-cyan-300/90 italic",
};

function RouteBadge({ route }: { route: string | null }) {
  if (!route) return <span className="num text-[9px] text-slate-600">-</span>;
  const map: Record<string, { label: string; color: string }> = {
    machine: { label: "机", color: "text-cyan-300 border-cyan-400/20 bg-cyan-400/10" },
    swarm: { label: "蜂", color: "text-amber-300 border-amber-400/20 bg-amber-400/10" },
    psionic: { label: "灵", color: "text-violet-300 border-violet-400/20 bg-violet-400/10" },
  };
  const m = map[route] || { label: "?", color: "text-slate-500" };
  return <span className={`num rounded border px-1 py-0 text-[9px] ${m.color}`}>{m.label}</span>;
}

function Leaderboard() {
  const save = useGame((s) => s.save);
  const user = useGame((s) => s.user);
  const { top, myRank, myRankNumber, total, source, loading, error, lastFetchedAt, fetch, refresh } = useLeague();
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!save || !user) return;
    void fetch(save, user.uid, user.account);
  }, [save?.meta.totalEnergy, user?.uid]);

  const handleRefresh = () => {
    if (!save || !user) return;
    void refresh(save, user.uid, user.account);
  };

  const rows = useMemo(() => top, [top]);

  return (
    <div className="panel rounded-lg p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="size-3.5 text-amber-300/80" />
          <span className="hud-tag">方舟网络 · 产能榜</span>
          {source === "real" ? (
            <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
              <Wifi className="size-2.5" /> LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[9px] text-slate-500">
              <WifiOff className="size-2.5" /> MOCK
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {myRankNumber && <span className="num text-[10px] text-cyan-300/80">#{myRankNumber}/{total}</span>}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="rounded border border-white/10 bg-white/5 p-1 text-slate-500 hover:bg-white/10 hover:text-slate-300 disabled:opacity-50"
            title="刷新排行榜"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-1">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-slate-600">
            {loading ? "正在同步方舟网络..." : "暂无数据，等待第一位开拓者"}
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={`${r.uid}-${i}`}
              className={`flex items-center gap-2 rounded px-1.5 py-1.5 text-[11px] transition ${
                r.me ? "bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20" : "text-slate-500 hover:bg-white/5"
              }`}
            >
              <span
                className={`num flex w-5 items-center justify-center text-[10px] ${
                  i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : r.me ? "text-cyan-300" : "text-slate-600"
                }`}
              >
                {i === 0 ? <Crown className="size-3" /> : i + 1}
              </span>
              <RouteBadge route={r.route} />
              <span className="flex-1 truncate">
                {r.account}
                {r.escaped ? <Rocket className="ml-1 inline size-2.5 text-emerald-400" /> : <Skull className="ml-1 inline size-2.5 text-slate-600" />}
              </span>
              <span className="num text-[10px]">{r.run_score >= 10000 ? fmt(r.run_score) : Math.floor(r.run_score)}</span>
            </div>
          ))
        )}
      </div>

      {myRank && myRankNumber && myRankNumber > 8 && (
        <div className="mt-2 border-t border-white/5 pt-2">
          <div className="flex items-center gap-2 rounded bg-cyan-400/10 px-1.5 py-1 text-[11px] text-cyan-100 ring-1 ring-cyan-400/20">
            <span className="num w-5 text-center text-[10px] text-cyan-300">#{myRankNumber}</span>
            <RouteBadge route={myRank.route} />
            <span className="flex-1 truncate">{myRank.account}</span>
            <span className="num text-[10px]">{fmt(myRank.run_score)}</span>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between text-[10px]">
        <p className="leading-4 text-slate-600">
          {source === "real" ? `联机实时榜 · ${total} 位开拓者` : "模拟节点 · 正式赛季由 dueGame 集群结算"}
          {lastFetchedAt && <span className="ml-1 text-slate-700">· {new Date(lastFetchedAt).toLocaleTimeString()}</span>}
        </p>
        <button onClick={() => setShowFull(!showFull)} className="num text-[10px] text-slate-500 underline hover:text-slate-300">
          {showFull ? "收起" : "查看完整榜"}
        </button>
      </div>

      {showFull && <FullLeaderboard />}
    </div>
  );
}

function FullLeaderboard() {
  const { fullTop, myRank, total, loading, fetchFull } = useLeague();
  const user = useGame((s) => s.user);

  useEffect(() => {
    if (!user) return;
    void fetchFull(user.uid);
  }, []);

  if (fullTop.length === 0) {
    return (
      <div className="mt-3 rounded border border-white/5 bg-black/20 p-3 text-center text-[11px] text-slate-600">
        {loading ? "加载完整榜单..." : "暂无完整数据"}
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-96 overflow-y-auto rounded border border-white/5 bg-black/20 p-2 scroll-slim">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-slate-400">完整榜单 Top {fullTop.length}</span>
        <span className="num text-[10px] text-slate-600">共 {total} 人</span>
      </div>
      <div className="space-y-0.5">
        {fullTop.map((r) => (
          <div key={r.uid} className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] ${r.me ? "bg-cyan-400/10 text-cyan-100" : "text-slate-500"}`}>
            <span className="num w-6 text-[10px] text-slate-600">#{r.rank}</span>
            <RouteBadge route={r.route} />
            <span className="flex-1 truncate">{r.account}</span>
            <span className="num text-[10px]">{fmt(r.run_score)}</span>
            <span className="num text-[9px] text-slate-700">{r.cores}核</span>
          </div>
        ))}
      </div>
      {myRank && myRank.rank > 100 && (
        <div className="mt-2 border-t border-white/5 pt-2">
          <div className="text-[10px] text-slate-600">你的排名</div>
          <div className="flex items-center gap-2 rounded bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100">
            <span className="num w-6 text-[10px]">#{myRank.rank}</span>
            <span className="flex-1 truncate">{myRank.account}</span>
            <span className="num">{fmt(myRank.run_score)}</span>
          </div>
        </div>
      )}
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
      <div className={`panel rounded-lg p-4 ${urgent ? "urgent-pulse" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlarmClock className={`size-4 ${urgent ? "text-red-400" : "text-cyan-300/80"}`} />
            <span className="hud-tag">地球解体倒计时 · T-MINUS</span>
          </div>
          <span className="num text-[10px] text-slate-600">RUN #{save.run.runId}</span>
        </div>
        <div className={`num mt-2 text-center text-[42px] font-bold leading-none tracking-wide ${urgent ? "text-red-300" : "text-slate-100"}`}>{fmtClock(remain)}</div>
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

      <div className="panel rounded-lg p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="hud-tag">TERRA · 近地轨道实况</span>
          <span className="num text-[10px] text-slate-600">SAT-LINK 07 {isRealApi ? "● LIVE" : "○ MOCK"}</span>
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

      <div className="panel rounded-lg p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <TerminalSquare className="size-3.5 text-cyan-300/80" />
          <span className="hud-tag">方舟日志 · SYSTEM LOG</span>
        </div>
        <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {[...logs].reverse().map((l) => (
            <div key={l.id} className="rise-in flex gap-2 text-[11px] leading-4.5">
              <span className="num shrink-0 text-slate-600">{new Date(l.time).toLocaleTimeString("zh-CN", { hour12: false })}</span>
              <span className={TONE_CLASS[l.tone]}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>

      <Leaderboard />

      <div className="num text-center text-[10px] leading-4 text-slate-700">
        TICK {GLOBAL.tickMs}ms · AUTOSAVE {GLOBAL.autosaveMs / 1000}s · 离线收益 {GLOBAL.offlineEfficiency * 100}% 上限 {GLOBAL.offlineCapHours}h
        <br />
        {isRealApi ? "后端: 真实排行榜 (dueGame 协议)" : "后端: 模拟节点 (localStorage)"}
      </div>
    </aside>
  );
}
