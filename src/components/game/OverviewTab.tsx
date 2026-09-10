import { useState } from "react";
import { Activity, CloudUpload, Database, Trash2, UserRound } from "lucide-react";
import { BUILDINGS, RESEARCH, RES_META } from "@/game/config";
import { fmt, fmtDur, fmtRate } from "@/game/fmt";
import { useGame } from "@/game/store";
import type { ResourceKey } from "@/game/config";

const RES_ORDER: ResourceKey[] = ["energy", "material", "research", "special"];

export default function OverviewTab() {
  const save = useGame((s) => s.save);
  const derived = useGame((s) => s.derived);
  const user = useGame((s) => s.user);
  const now = useGame((s) => s.now);
  const saveNow = useGame((s) => s.saveNow);
  const wipeAll = useGame((s) => s.wipeAll);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!save || !derived || !user) return null;

  const runSecs = Math.max(0, (now - save.run.startedAt) / 1000);
  const buildingTotal = Object.values(save.run.buildings).reduce((a, b) => a + b, 0);
  const researchDone = RESEARCH.filter((r) => save.run.research[r.id]).length;

  return (
    <div className="space-y-4">
      {/* 序章 */}
      <div className="panel rounded-lg px-5 py-4">
        <div className="hud-tag mb-1">MISSION BRIEF · 第 {save.run.runId} 纪元</div>
        <p className="text-[12px] leading-5.5 text-slate-400">
          地核裂解已无法逆转。联合指挥部把最后的工业体系交到你手中:采集能量、恢复物资与科研产线,
          攀过六个科技纪元,在倒计时归零前建成「曲率引擎」并点火逃离。每个终点都是新的起点——
          星核将记下这个文明来过、抗争过、并且没有放弃的一切。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 本轮统计 */}
        <div className="panel rounded-lg p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="size-4 text-cyan-300" />
            <span className="text-sm font-bold text-slate-200">本轮统计</span>
            <span className="num text-[9px] tracking-widest text-slate-600">RUN #{save.run.runId}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-[12px]">
            {[
              ["本轮时长", fmtDur(runSecs)],
              ["累计产能", fmt(save.run.stats.energyTotal)],
              ["手动点击", fmt(save.run.stats.clicks)],
              ["建筑总数", fmt(buildingTotal)],
              ["科技进度", `${researchDone}/${RESEARCH.length}`],
              ["建筑蓝图", `${BUILDINGS.length} 类`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-white/6 bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="num mt-0.5 font-bold text-slate-200">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-[11px] font-bold text-slate-300">产能明细</div>
          <div className="mt-2 space-y-1.5">
            {RES_ORDER.map((k) => {
              const rate = k === "energy" ? derived.rates.energy + derived.autoRate : derived.rates[k];
              if (k === "special" && !save.run.route) return null;
              const routeSpecial = k === "special" && save.run.route;
              const meta = RES_META[k];
              const name = routeSpecial ? (save.run.route === "machine" ? "算力" : save.run.route === "swarm" ? "生物质" : "灵能") : meta.name;
              const color = routeSpecial ? "#a78bfa" : meta.color;
              const src = derived.srcMult;
              const parts: string[] = [];
              if (src.research[k] !== 1) parts.push(`科技×${src.research[k].toFixed(2)}`);
              if (src.route[k] !== 1) parts.push(`路线×${src.route[k].toFixed(2)}`);
              if (src.core[k] !== 1) parts.push(`星核×${src.core[k].toFixed(2)}`);
              return (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-10 shrink-0" style={{ color }}>
                    {name}
                  </span>
                  <span className="num text-slate-500">{fmtRate(k === "special" ? derived.baseRates.special : derived.baseRates[k])}</span>
                  <span className="num flex-1 truncate text-slate-600">{parts.join(" · ") || "—"}</span>
                  <span className="num font-bold" style={{ color }}>
                    {fmtRate(rate)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 账户与存档 */}
        <div className="space-y-4">
          <div className="panel rounded-lg p-5">
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="size-4 text-cyan-300" />
              <span className="text-sm font-bold text-slate-200">指挥官档案</span>
            </div>
            <div className="space-y-1.5 text-[12px]">
              {[
                ["账号", user.account],
                ["UID", user.uid],
                ["注册于", new Date(user.createdAt).toLocaleString("zh-CN", { hour12: false })],
                ["轮回次数", `${save.meta.runs} 次(逃生 ${save.meta.escapes} · 陨落 ${save.meta.deaths})`],
                ["最佳逃生记录", save.meta.bestRemainSec > 0 ? `提前 ${fmtDur(save.meta.bestRemainSec)}` : "—"],
                ["生涯总产能", fmt(save.meta.totalEnergy)],
                ["生涯总点击", fmt(save.meta.totalClicks)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-white/4 py-1.5 last:border-0">
                  <span className="text-slate-500">{k}</span>
                  <span className="num text-right text-slate-300">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-lg p-5">
            <div className="mb-3 flex items-center gap-2">
              <Database className="size-4 text-cyan-300" />
              <span className="text-sm font-bold text-slate-200">云端存档</span>
            </div>
            <p className="text-[11px] leading-4.5 text-slate-500">
              存档每 8 秒自动同步至游戏服务器(MongoDB · players 集合)。关闭页面前无需手动操作;离线期间按 50% 效率结算,上限 8 小时。
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  setSaving(true);
                  await saveNow();
                  setTimeout(() => setSaving(false), 500);
                }}
                className="num flex flex-1 items-center justify-center gap-2 rounded border border-cyan-300/40 bg-cyan-400/10 py-2.5 text-[11px] font-bold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                <CloudUpload className="size-3.5" />
                {saving ? "同步中…" : "立即同步"}
              </button>
              {!confirmWipe ? (
                <button
                  onClick={() => setConfirmWipe(true)}
                  className="num flex flex-1 items-center justify-center gap-2 rounded border border-white/15 py-2.5 text-[11px] font-bold text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" /> 重置存档
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await wipeAll();
                    setConfirmWipe(false);
                  }}
                  className="num flex-1 rounded border border-red-400/50 bg-red-500/15 py-2.5 text-[11px] font-bold text-red-200 hover:bg-red-500/25"
                >
                  确认清空?(不可恢复)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
