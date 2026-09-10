import { useEffect, useState } from "react";
import { Trophy, Crown, Rocket, Skull, RefreshCw, Wifi, WifiOff, Filter, TrendingUp, Clock, Zap, Award } from "lucide-react";
import { fmt } from "@/game/fmt";
import { useGame } from "@/game/store";
import { useLeague } from "@/game/leagueStore";
import { isRealApi } from "@/services/api";

const ROUTE_META: Record<string, { name: string; color: string; bg: string }> = {
  machine: { name: "机械飞升", color: "text-cyan-300", bg: "bg-cyan-400/10 border-cyan-400/20" },
  swarm: { name: "蜂群意志", color: "text-amber-300", bg: "bg-amber-400/10 border-amber-400/20" },
  psionic: { name: "灵能升华", color: "text-violet-300", bg: "bg-violet-400/10 border-violet-400/20" },
};

export default function LeaderboardTab() {
  const save = useGame((s) => s.save);
  const user = useGame((s) => s.user);
  const { fullTop, myRank, total, source, loading, error, sortBy, routeFilter, setSortBy, setRouteFilter, fetchFull } = useLeague();
  const [localFilter, setLocalFilter] = useState<RouteFilter>("all");

  useEffect(() => {
    if (!user) return;
    void fetchFull(user.uid);
  }, [user?.uid, sortBy, routeFilter]);

  const handleRefresh = () => {
    if (!user) return;
    void fetchFull(user.uid);
  };

  const filteredTop = fullTop.filter((e) => {
    if (localFilter === "all") return true;
    return e.route === localFilter;
  });

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="panel rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-amber-400/10">
              <Trophy className="size-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">方舟网络 · 赛季排行榜</h2>
              <p className="num text-[10px] tracking-widest text-slate-500">LEAGUE · SEASON {save ? Math.floor(save.meta.runs / 10) + 1 : 1}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {source === "real" ? (
              <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">
                <Wifi className="size-3" /> LIVE · dueGame 集群
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[10px] text-slate-500">
                <WifiOff className="size-3" /> MOCK · 本地模拟
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <TrendingUp className="size-3" /> 总开拓者
            </div>
            <div className="num mt-1 text-xl font-bold text-slate-100">{total}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Crown className="size-3" /> 最高分
            </div>
            <div className="num mt-1 text-xl font-bold text-amber-300">{fullTop[0] ? fmt(fullTop[0].run_score) : "-"}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Award className="size-3" /> 我的排名
            </div>
            <div className="num mt-1 text-xl font-bold text-cyan-300">{myRank ? `#${myRank.rank}` : "-"}</div>
          </div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <span className="px-2 text-[10px] text-slate-600">
            <Filter className="mr-1 inline size-3" /> 路线
          </span>
          {[
            { id: "all", label: "全部" },
            { id: "machine", label: "机械" },
            { id: "swarm", label: "蜂群" },
            { id: "psionic", label: "灵能" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setLocalFilter(r.id as any)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${localFilter === r.id ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <span className="px-2 text-[10px] text-slate-600">排序</span>
          {[
            { id: "run_score", label: "分数" },
            { id: "totalEnergy", label: "总能量" },
            { id: "cores", label: "星核" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id as any)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${sortBy === s.id ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-[10px] text-slate-600">
          {isRealApi ? "数据来自真实后端 · 30秒自动刷新" : "模拟数据 · 接入真实后端后自动切换"}
        </div>
      </div>

      {/* 榜单 */}
      <div className="panel rounded-lg p-4">
        {error && (
          <div className="mb-3 rounded border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            加载失败: {error}
          </div>
        )}

        {loading && filteredTop.length === 0 ? (
          <div className="grid place-items-center py-20">
            <RefreshCw className="size-6 animate-spin text-slate-600" />
            <div className="mt-2 text-[11px] text-slate-600">正在同步方舟网络...</div>
          </div>
        ) : filteredTop.length === 0 ? (
          <div className="py-20 text-center">
            <Trophy className="mx-auto size-8 text-slate-700" />
            <div className="mt-2 text-[12px] text-slate-600">暂无排行数据，等待第一位开拓者</div>
            <div className="mt-1 text-[10px] text-slate-700">完成一次轮回（逃生或死亡）即可上榜</div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* 表头 */}
            <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-600">
              <span className="w-8">排名</span>
              <span className="w-12">路线</span>
              <span className="flex-1">开拓者</span>
              <span className="w-20 text-right">分数</span>
              <span className="w-16 text-right">星核</span>
              <span className="w-20 text-right">总能量</span>
              <span className="w-12 text-center">状态</span>
            </div>

            {filteredTop.map((entry, idx) => {
              const isMe = entry.uid === user?.uid;
              const routeMeta = entry.route ? ROUTE_META[entry.route] : null;
              return (
                <div
                  key={entry.uid}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2.5 text-[11px] transition ${
                    isMe
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                      : idx < 3
                        ? "border-amber-400/10 bg-amber-400/5 text-slate-300"
                        : "border-white/5 bg-black/20 text-slate-500 hover:bg-white/5"
                  }`}
                >
                  <span className={`num flex w-8 items-center gap-1 font-bold ${idx === 0 ? "text-amber-300" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-amber-600" : ""}`}>
                    {idx === 0 ? <Crown className="size-3.5" /> : null}
                    #{entry.rank}
                  </span>

                  <span className="w-12">
                    {routeMeta ? (
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${routeMeta.bg} ${routeMeta.color}`}>{routeMeta.name.slice(0, 2)}</span>
                    ) : (
                      <span className="text-[10px] text-slate-700">-</span>
                    )}
                  </span>

                  <span className="flex flex-1 items-center gap-2 truncate">
                    <span className="truncate font-bold">{entry.account}</span>
                    {isMe && <span className="rounded bg-cyan-400/20 px-1 text-[9px] text-cyan-300">你</span>}
                  </span>

                  <span className="num w-20 text-right font-bold">{fmt(entry.run_score)}</span>
                  <span className="num w-16 text-right">{entry.cores}</span>
                  <span className="num w-20 text-right text-[10px]">{fmt(entry.totalEnergy)}</span>

                  <span className="flex w-12 justify-center">
                    {entry.escaped ? <Rocket className="size-3.5 text-emerald-400" title="已逃生" /> : <Skull className="size-3.5 text-slate-600" title="已陨落" />}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 我的排名 (若不在当前筛选内) */}
        {myRank && !filteredTop.find((e) => e.uid === myRank.uid) && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="mb-1 text-[10px] text-slate-600">你的排名 (当前筛选外)</div>
            <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-2.5 text-[11px] text-cyan-100">
              <span className="num w-8 font-bold">#{myRank.rank}</span>
              <span className="w-12">
                {myRank.route ? <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-300">{ROUTE_META[myRank.route]?.name.slice(0, 2) || myRank.route}</span> : "-"}
              </span>
              <span className="flex-1 truncate font-bold">{myRank.account}</span>
              <span className="num w-20 text-right font-bold">{fmt(myRank.run_score)}</span>
              <span className="num w-16 text-right">{myRank.cores}</span>
              <span className="num w-20 text-right text-[10px]">{fmt(myRank.totalEnergy)}</span>
              <span className="flex w-12 justify-center">{myRank.escaped ? <Rocket className="size-3.5 text-emerald-400" /> : <Skull className="size-3.5 text-slate-600" />}</span>
            </div>
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="rounded-lg border border-white/5 bg-black/10 p-3 text-[10px] leading-4 text-slate-600">
        <div className="flex items-center gap-1.5 font-bold text-slate-500">
          <Clock className="size-3" /> 排行榜说明
        </div>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>分数 = √(累计产能/1e6) + 星核×10 + 逃生奖励，每轮回结束后自动提交</li>
          <li>真实后端由 dueGame LeagueActor 权威结算，内存缓存 10s 刷新，MongoDB 持久化</li>
          <li>反作弊：资源增量上限校验、分数上限 1e12、限流 10次/分钟</li>
          <li>当前模式：{source === "real" ? "真实后端 (Express + MemoryStore, 可替换为 MongoDB)" : "本地模拟 (localStorage)"}</li>
          <li>接入真实后端：设置环境变量 VITE_API_URL=http://localhost:3001 并启动 server/node</li>
        </ul>
      </div>
    </div>
  );
}

type RouteFilter = "all" | "machine" | "swarm" | "psionic";
