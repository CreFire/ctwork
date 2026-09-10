import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, PackageOpen, Rocket, Skull, MoonStar } from "lucide-react";
import { GLOBAL } from "@/game/config";
import { fmt, fmtClock, fmtDur } from "@/game/fmt";
import { useGame } from "@/game/store";
import type { Tone } from "@/game/store";

/* ---------------- 通知 ---------------- */
const TOAST_TONE: Record<Tone, string> = {
  info: "border-cyan-300/30",
  success: "border-emerald-400/40",
  warn: "border-amber-400/40",
  danger: "border-red-400/50",
  story: "border-violet-300/40",
};

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-72 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            className={`pointer-events-auto rounded-lg border bg-[#0a1322f2] p-3 shadow-xl backdrop-blur ${TOAST_TONE[t.tone]}`}
          >
            <div className="flex items-center gap-2 text-[12px] font-bold text-slate-200">
              <BellRing className="size-3.5 text-cyan-300" />
              {t.title}
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{t.text}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- 漂流补给舱 ---------------- */
export function CrateButton() {
  const crate = useGame((s) => s.crate);
  const now = useGame((s) => s.now);
  const collectCrate = useGame((s) => s.collectCrate);
  return (
    <AnimatePresence>
      {crate && (
        <motion.button
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          onClick={collectCrate}
          className="fixed bottom-20 right-5 z-[65] rounded-lg border border-amber-300/50 bg-amber-400/15 px-4 py-3 text-left shadow-[0_0_30px_rgba(251,191,36,0.25)] backdrop-blur"
          style={{ animation: "crate-bob 2s ease-in-out infinite" }}
        >
          <div className="flex items-center gap-2 text-[12px] font-bold text-amber-200">
            <PackageOpen className="size-4" />
            漂流补给舱 · 点击回收
          </div>
          <div className="num mt-0.5 text-[10px] text-amber-300/80">窗口期剩余 {Math.max(0, Math.ceil((crate.expiresAt - now) / 1000))}s</div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ---------------- 过场动画:爆炸 / 点火 ---------------- */
export function CinematicOverlay() {
  const cinematic = useGame((s) => s.cinematic);
  const cinematicDone = useGame((s) => s.cinematicDone);

  useEffect(() => {
    if (!cinematic) return;
    const t = setTimeout(cinematicDone, cinematic === "launch" ? 2800 : 3400);
    return () => clearTimeout(t);
  }, [cinematic, cinematicDone]);

  return (
    <AnimatePresence>
      {cinematic === "explosion" && (
        <motion.div key="exp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] overflow-hidden bg-black">
          {/* 白闪 */}
          <div className="absolute inset-0 bg-white" style={{ animation: "flashout 0.9s ease-out both" }} />
          {/* 冲击波 */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 size-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-orange-400/80"
              style={{ animation: `shock 1.8s ${0.25 + i * 0.35}s ease-out both` }}
            />
          ))}
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,120,40,0.5), rgba(120,10,0,0.7) 55%, black 80%)", animation: "flashout 3.4s ease both" }} />
          <div className="shake-hard absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center" style={{ animation: "flashout 3.4s ease both" }}>
              <div className="disp text-4xl font-bold tracking-[0.4em] text-red-200 md:text-6xl">地球 · 已归于星尘</div>
              <div className="num mt-4 text-xs tracking-[0.5em] text-red-300/70">EARTH // TERMINATED</div>
            </div>
          </div>
        </motion.div>
      )}
      {cinematic === "launch" && (
        <motion.div key="launch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] overflow-hidden bg-[#010409]">
          {Array.from({ length: 26 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-px w-[30%]"
              style={{
                top: `${(i / 26) * 100}%`,
                left: 0,
                background: "linear-gradient(90deg, transparent, rgba(103,232,249,0.9), transparent)",
                animation: `streak ${0.7 + (i % 5) * 0.18}s ${i * 0.06}s linear infinite`,
              }}
            />
          ))}
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <Rocket className="mx-auto size-10 text-cyan-200" style={{ filter: "drop-shadow(0 0 18px rgba(34,211,238,0.9))" }} />
              <div className="disp mt-4 text-4xl font-bold tracking-[0.4em] text-cyan-100 md:text-6xl">曲率泡展开</div>
              <div className="num mt-4 text-xs tracking-[0.5em] text-cyan-300/70">IGNITION // WARP BUBBLE STABLE</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- 纪元结算 ---------------- */
export function SummaryModal() {
  const summary = useGame((s) => s.summary);
  const closeSummary = useGame((s) => s.closeSummary);
  return (
    <AnimatePresence>
      {summary && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} className="panel w-full max-w-md rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className={`grid size-12 place-items-center rounded-lg border ${summary.escaped ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200" : "border-red-400/40 bg-red-500/10 text-red-300"}`}>
                {summary.escaped ? <Rocket className="size-6" /> : <Skull className="size-6" />}
              </div>
              <div>
                <div className="text-lg font-black text-slate-100">第 {summary.runId} 纪元 · {summary.escaped ? "方舟点火" : "母星陨落"}</div>
                <div className="num text-[10px] tracking-widest text-slate-500">EPOCH SETTLEMENT</div>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-slate-400">
              {summary.escaped
                ? `方舟在倒计时 ${fmtClock(summary.remainSec)} 时跃迁成功。身后的家园化作了一瞬的光——但船上的每个人都看见了。`
                : summary.remainSec <= 0
                  ? "没有人能阻止恒星的葬礼。逃生舱带着文明的残响离开轨道,回头时,太阳系只剩下一片缓缓扩散的尘埃。"
                  : "曲率引擎未能完工。在最后时刻,逃生舱脱离母船,成为文明唯一的种子。"}
            </p>
            {summary.epitaph && (
              <p className="mt-2 border-l-2 border-red-400/40 pl-3 text-[12px] italic leading-5 text-slate-300">
                墓志铭:「{summary.epitaph}」
              </p>
            )}
            <div className="mt-4 space-y-1.5 rounded-lg border border-white/8 bg-black/25 p-3.5 text-[12px]">
              <div className="flex justify-between"><span className="text-slate-500">纪元保底</span><span className="num text-violet-200">+{summary.reward.base} 星核</span></div>
              <div className="flex justify-between"><span className="text-slate-500">产能折算</span><span className="num text-violet-200">+{summary.reward.production} 星核</span></div>
              <div className="flex justify-between"><span className="text-slate-500">时间奖励</span><span className="num text-violet-200">+{summary.reward.time} 星核</span></div>
              <div className="mt-1 flex justify-between border-t border-white/10 pt-1.5 font-bold"><span className="text-slate-300">合计</span><span className="num text-violet-300">×{summary.reward.total}</span></div>
            </div>
            <button
              onClick={closeSummary}
              className="disp mt-5 w-full rounded border border-violet-300/45 bg-violet-400/10 py-3 text-sm font-bold tracking-[0.3em] text-violet-100 transition hover:bg-violet-400/20"
            >
              进入新纪元
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- 离线报告 ---------------- */
export function OfflineModal() {
  const offline = useGame((s) => s.offline);
  const closeOffline = useGame((s) => s.closeOffline);
  return (
    <AnimatePresence>
      {offline && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[75] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} className="panel w-full max-w-sm rounded-lg p-6">
            <div className="flex items-center gap-2 text-cyan-200">
              <MoonStar className="size-5" />
              <span className="text-base font-black">休眠报告</span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-slate-400">
              你离开了 <span className="num text-cyan-200">{fmtDur(offline.seconds)}</span>。方舟以 {GLOBAL.offlineEfficiency * 100}% 效率持续运转:
            </p>
            <div className="mt-3 space-y-1.5 rounded-lg border border-white/8 bg-black/25 p-3.5 text-[12px]">
              {(
                [
                  ["energy", "能量", "#22d3ee"],
                  ["material", "物资", "#f59e0b"],
                  ["research", "科研", "#4ade80"],
                  ["special", "特殊", "#a78bfa"],
                ] as const
              )
                .filter(([k]) => offline.gains[k] > 0.01)
                .map(([k, name, color]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{name}</span>
                    <span className="num font-bold" style={{ color }}>
                      +{fmt(offline.gains[k])}
                    </span>
                  </div>
                ))}
            </div>
            <button onClick={closeOffline} className="disp mt-5 w-full rounded border border-cyan-300/40 bg-cyan-400/10 py-2.5 text-sm font-bold tracking-[0.3em] text-cyan-100 transition hover:bg-cyan-400/20">
              接管方舟
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- 末日光晕 ---------------- */
export function UrgencyVignette() {
  const save = useGame((s) => s.save);
  const now = useGame((s) => s.now);
  if (!save) return null;
  const remain = (save.run.deadlineAt - now) / 1000;
  if (remain > 120) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[55] animate-pulse"
      style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(200,30,20,0.22) 100%)" }}
    />
  );
}
