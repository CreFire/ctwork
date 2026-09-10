import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Zap, Hammer, FlaskConical, Network, Rocket, Loader2, Trophy, Landmark } from "lucide-react";
import StarCanvas from "@/components/StarCanvas";
import AuthScreen from "@/components/AuthScreen";
import TopBar from "@/components/game/TopBar";
import SidePanel from "@/components/game/SidePanel";
import OverviewTab from "@/components/game/OverviewTab";
import EnergyTab from "@/components/game/EnergyTab";
import BuildTab from "@/components/game/BuildTab";
import ResearchTab from "@/components/game/ResearchTab";
import RoutesTab from "@/components/game/RoutesTab";
import LaunchTab from "@/components/game/LaunchTab";
import LeaderboardTab from "@/components/game/LeaderboardTab";
import ChronicleTab from "@/components/game/ChronicleTab";
import { CinematicOverlay, CrateButton, OfflineModal, SummaryModal, Toasts, UrgencyVignette } from "@/components/game/Overlays";
import { AUTOSAVE_MS, TICK_MS, useGame } from "@/game/store";
import type { TabId } from "@/game/store";

const TABS: Array<{ id: TabId; name: string; icon: typeof Zap; en: string }> = [
  { id: "overview", name: "总览", icon: LayoutDashboard, en: "BRIEF" },
  { id: "energy", name: "能源核心", icon: Zap, en: "REACTOR" },
  { id: "build", name: "建设", icon: Hammer, en: "BUILD" },
  { id: "research", name: "科技树", icon: FlaskConical, en: "SCIENCE" },
  { id: "routes", name: "飞升路线", icon: Network, en: "ASCEND" },
  { id: "launch", name: "方舟发射", icon: Rocket, en: "LAUNCH" },
  { id: "leaderboard", name: "排行榜", icon: Trophy, en: "LEAGUE" },
  { id: "chronicle", name: "文明编年史", icon: Landmark, en: "CHRONICLE" },
];

function GameShell() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);

  return (
    <div className="scanlines min-h-screen">
      <StarCanvas />
      <TopBar />
      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_345px]">
        <section className="min-w-0">
          {/* 标签导航 */}
          <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-white/8 bg-black/25 p-1 backdrop-blur scroll-slim">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2.5 text-[12px] font-bold transition ${
                    active ? "text-cyan-100" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-md border border-cyan-300/35 bg-cyan-400/12" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <t.icon className="relative z-10 size-4" />
                  <span className="relative z-10">{t.name}</span>
                  <span className="num relative z-10 hidden text-[8px] tracking-[0.2em] opacity-60 xl:inline">{t.en}</span>
                </button>
              );
            })}
          </nav>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: "easeOut" }}>
              {tab === "overview" && <OverviewTab />}
              {tab === "energy" && <EnergyTab />}
              {tab === "build" && <BuildTab />}
              {tab === "research" && <ResearchTab />}
              {tab === "routes" && <RoutesTab />}
              {tab === "launch" && <LaunchTab />}
              {tab === "leaderboard" && <LeaderboardTab />}
              {tab === "chronicle" && <ChronicleTab />}
            </motion.div>
          </AnimatePresence>
        </section>

        <SidePanel />
      </main>

      <Toasts />
      <CrateButton />
      <UrgencyVignette />
      <CinematicOverlay />
      <SummaryModal />
      <OfflineModal />
    </div>
  );
}

function BootScreen() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <StarCanvas />
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-8 animate-spin text-cyan-300" />
        <div className="num text-xs tracking-[0.4em] text-cyan-200/80">正在接入方舟网络…</div>
        <div className="num text-[10px] tracking-widest text-slate-600">CONNECTING TO dueGame CLUSTER</div>
      </div>
    </div>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);

  // 会话恢复
  useEffect(() => {
    void useGame.getState().reconnect();
  }, []);

  // 游戏主循环 + 自动存档
  useEffect(() => {
    if (phase !== "playing") return;
    const tickTimer = setInterval(() => useGame.getState().tick(), TICK_MS);
    const saveTimer = setInterval(() => void useGame.getState().saveNow(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.hidden) void useGame.getState().saveNow();
    };
    const onBeforeUnload = () => {
      const s = useGame.getState();
      if (s.user && s.save) {
        try {
          localStorage.setItem(`ark_server_save_${s.user.uid}`, JSON.stringify(s.save));
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(tickTimer);
      clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase]);

  return (
    <div className="font-sans">
      {phase === "auth" && (
        <div className="scanlines">
          <StarCanvas />
          <AuthScreen />
        </div>
      )}
      {phase === "boot" && <BootScreen />}
      {phase === "playing" && <GameShell />}
    </div>
  );
}
