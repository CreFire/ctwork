/**
 * 文明编年史 · 墓碑园 · 方舟纪念碑 · 文明快照
 * 每一次轮回的终局都会在这里落笔:
 *   - 毁灭 → 文明墓碑(随机但恒定的墓志铭)
 *   - 逃逸 → 方舟纪念碑(记录点火时刻的剩余窗口)
 * 快照区一览文明当前状态与生涯统计,随云存档同步。
 */
import { Landmark, Rocket, ScrollText, Skull } from "lucide-react";
import { ERAS, RESEARCH, RES_META, ROUTES } from "@/game/config";
import { eraReachedOf, type RunRecord } from "@/game/engine";
import { fmt, fmtClock, fmtRate } from "@/game/fmt";
import { useGame } from "@/game/store";

const eraName = (era: number) => ERAS[era]?.name ?? "危机纪元";
const routeName = (r: string | null) => (r ? (ROUTES.find((x) => x.id === r)?.name ?? r) : "未抉择");

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Chip({ label, value, accent = "text-slate-200" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[10px] tracking-wider text-slate-600">{label}</div>
      <div className={`num mt-0.5 truncate text-[13px] font-bold ${accent}`}>{value}</div>
    </div>
  );
}

/* ---------------- 文明快照(当前状态整体预览) ---------------- */
function Snapshot() {
  const save = useGame((s) => s.save);
  const derived = useGame((s) => s.derived);
  const user = useGame((s) => s.user);
  const now = useGame((s) => s.now);
  if (!save || !derived || !user) return null;

  const remain = Math.max(0, (save.run.deadlineAt - now) / 1000);
  const urgent = remain < 300;
  const researchCount = Object.keys(save.run.research).filter((k) => save.run.research[k]).length;
  let buildingsTotal = 0;
  for (const n of Object.values(save.run.buildings)) buildingsTotal += n;
  const records = save.meta.history ?? [];
  const tombs = records.filter((r) => !r.escaped).length;
  const monuments = records.filter((r) => r.escaped).length;

  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="size-4 text-cyan-300/80" />
          <span className="hud-tag">文明快照 · SNAPSHOT</span>
        </div>
        <span className="num text-[10px] text-slate-600">
          {user.account} · {user.uid}
        </span>
      </div>

      {/* 身份与现状 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Chip label="当前轮回" value={`RUN #${save.run.runId}`} accent="text-cyan-200" />
        <Chip label="达成纪元" value={eraName(eraReachedOf(save))} />
        <Chip label="科技路线" value={routeName(save.run.route)} accent={save.run.route ? "text-violet-200" : "text-slate-400"} />
        <Chip label="解体倒计时" value={fmtClock(remain)} accent={urgent ? "text-red-300" : "text-slate-200"} />
      </div>

      {/* 资源与产出 */}
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {(["energy", "material", "research", "special"] as const).map((k) => (
          <div key={k} className="rounded-md border border-white/5 bg-black/20 px-3 py-2">
            <div className="flex items-center justify-between text-[10px] tracking-wider text-slate-600">
              <span>{RES_META[k].name}</span>
              <span className="num">{fmtRate(k === "energy" ? derived.rates.energy + derived.autoRate : derived.rates[k])}</span>
            </div>
            <div className="num mt-0.5 text-[13px] font-bold" style={{ color: RES_META[k].color }}>
              {fmt(save.run.res[k])}
            </div>
          </div>
        ))}
      </div>

      {/* 进度与生涯 */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Chip label="科技进度" value={`${researchCount}/${RESEARCH.length}`} accent="text-emerald-300" />
        <Chip label="建筑总数" value={`${buildingsTotal} 座`} />
        <Chip label="点击次数" value={fmt(save.run.stats.clicks)} />
        <Chip label="星核储备" value={fmt(save.meta.cores)} accent="text-violet-300" />
        <Chip label="轮回总数" value={fmt(save.meta.runs)} />
        <Chip label="逃逸 / 湮灭" value={`${monuments} / ${tombs}`} accent="text-cyan-200" />
        <Chip label="累计产能" value={fmt(save.meta.totalEnergy)} />
        <Chip label="最佳剩余" value={fmtClock(save.meta.bestRemainSec)} accent="text-amber-300" />
      </div>
    </section>
  );
}

/* ---------------- 文明墓碑(毁灭轮回) ---------------- */
function Tombstone({ rec }: { rec: RunRecord }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/8 bg-gradient-to-b from-slate-900/60 to-black/60 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Skull className="size-4 text-slate-400" />
        <span className="hud-tag">第 {rec.runId} 号文明之墓</span>
      </div>
      <p className="mt-2 min-h-10 text-[12px] italic leading-5 text-slate-300">「{rec.epitaph}」</p>
      <div className="num mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>存续 {fmtClock(rec.durationSec)}</span>
        <span>· 抵达 {eraName(rec.era)}</span>
        {rec.route && <span>· {routeName(rec.route)}</span>}
        <span>· 产能 {fmt(rec.energyTotal)}</span>
        <span className="text-violet-300/80">星核 ×{rec.cores}</span>
      </div>
    </div>
  );
}

/* ---------------- 方舟纪念碑(逃逸轮回) ---------------- */
function Monument({ rec }: { rec: RunRecord }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-300/15 bg-gradient-to-b from-cyan-950/40 to-black/60 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Rocket className="size-4 text-cyan-200/90" />
        <span className="hud-tag">第 {rec.runId} 方舟纪念碑</span>
      </div>
      <p className="mt-2 min-h-10 text-[12px] leading-5 text-cyan-100/85">
        在倒计时 {fmtClock(rec.remainSec)} 时点火跃迁,文明于群星之间延续。
      </p>
      <div className="num mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>存续 {fmtClock(rec.durationSec)}</span>
        <span>· 抵达 {eraName(rec.era)}</span>
        {rec.route && <span>· {routeName(rec.route)}</span>}
        <span>· 产能 {fmt(rec.energyTotal)}</span>
        <span className="text-violet-300/80">星核 ×{rec.cores}</span>
      </div>
    </div>
  );
}

/* ---------------- 编年史时间线 ---------------- */
function TimelineRow({ rec }: { rec: RunRecord }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-white/5 bg-black/15 px-3 py-2.5">
      <div
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded border ${
          rec.escaped ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200" : "border-red-400/30 bg-red-500/10 text-red-300"
        }`}
      >
        {rec.escaped ? <Rocket className="size-3.5" /> : <Skull className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12px] font-bold text-slate-200">第 {rec.runId} 纪元</span>
          <span className={`text-[11px] font-bold ${rec.escaped ? "text-cyan-300" : "text-red-300"}`}>
            {rec.escaped ? "方舟跃迁成功" : "母星毁灭"}
          </span>
          <span className="num ml-auto text-[10px] text-slate-600">{fmtDate(rec.endedAt)}</span>
        </div>
        <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
          <span>抵达 {eraName(rec.era)}</span>
          <span>路线 {routeName(rec.route)}</span>
          <span>存续 {fmtClock(rec.durationSec)}</span>
          <span>产能 {fmt(rec.energyTotal)}</span>
          <span>科技 ×{rec.researchCount}</span>
          <span className="text-violet-300/80">星核 ×{rec.cores}</span>
        </div>
        {!rec.escaped && rec.epitaph && (
          <p className="mt-1.5 border-l-2 border-slate-700 pl-2 text-[11px] italic leading-4 text-slate-400">「{rec.epitaph}」</p>
        )}
      </div>
    </div>
  );
}

export default function ChronicleTab() {
  const save = useGame((s) => s.save);
  if (!save) return null;
  const records = save.meta.history ?? [];
  const tombs = records.filter((r) => !r.escaped);
  const monuments = records.filter((r) => r.escaped).reverse(); // 纪念碑按先后陈列

  return (
    <div className="space-y-4">
      <Snapshot />

      {/* 文明墓碑园 */}
      <section className="panel rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skull className="size-4 text-slate-400/90" />
            <span className="hud-tag">文明墓碑园 · GRAVEYARD</span>
          </div>
          <span className="num text-[10px] text-slate-600">{tombs.length} 座</span>
        </div>
        {tombs.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-600">
            墓碑园静悄悄 —— 还没有文明走向终结。
            <br />
            保持警惕,倒计时从不停止。
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tombs.map((rec) => (
              <Tombstone key={`t-${rec.runId}-${rec.endedAt}`} rec={rec} />
            ))}
          </div>
        )}
      </section>

      {/* 方舟纪念碑 */}
      <section className="panel rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-cyan-300/80" />
            <span className="hud-tag">方舟纪念碑 · MONUMENTS</span>
          </div>
          <span className="num text-[10px] text-slate-600">{monuments.length} 座</span>
        </div>
        {monuments.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-600">
            尚无方舟成功跃迁。
            <br />
            造好曲率引擎,攒足 25 万能量与 2.5 万物资 —— 窗口就在那里。
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {monuments.map((rec) => (
              <Monument key={`m-${rec.runId}-${rec.endedAt}`} rec={rec} />
            ))}
          </div>
        )}
      </section>

      {/* 编年史时间线 */}
      <section className="panel rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-amber-300/80" />
            <span className="hud-tag">文明编年史 · CHRONICLE</span>
          </div>
          <span className="num text-[10px] text-slate-600">容量 {records.length}/40 · 随云存档同步</span>
        </div>
        {records.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-600">
            编年史还是白纸。
            <br />
            第一个纪元,正在你的手中书写。
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((rec) => (
              <TimelineRow key={`r-${rec.runId}-${rec.endedAt}`} rec={rec} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
