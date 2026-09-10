import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Hourglass, Network, Infinity as InfinityIcon, ChevronRight, Loader2, ShieldCheck, CircleDot } from "lucide-react";
import { useGame } from "@/game/store";

const FEATURES = [
  { icon: Hourglass, title: "地球解体倒计时", desc: "实时走秒的家园终点,一切建造都与时间赛跑" },
  { icon: Rocket, title: "跨越六个科技纪元", desc: "从太阳能阵列到真空零点能,直至曲率引擎点火" },
  { icon: Network, title: "三大飞升路线", desc: "机械飞升 · 蜂群意志 · 灵能升华,自由切换重构流派" },
  { icon: InfinityIcon, title: "轮回与星核", desc: "逃生或毁灭都不是终点,星核遗产让每一轮回更强" },
];

export default function AuthScreen() {
  const { login, authBusy, authError } = useGame();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void login(account, password);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 主视觉 */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] bg-cover bg-center md:block"
        style={{
          backgroundImage: "url(/images/ark-poster.jpg)",
          maskImage: "linear-gradient(90deg, transparent, black 38%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 38%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-transparent to-void/60" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        {/* 顶栏 */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded border border-cyan-300/30 bg-cyan-400/10">
              <Rocket className="size-4.5 text-cyan-300" />
            </div>
            <div>
              <div className="disp text-sm font-bold tracking-[0.3em] text-cyan-200">ARK ERA</div>
              <div className="text-[10px] tracking-widest text-slate-500">方舟计划 · 联合指挥部</div>
            </div>
          </div>
          <div className="num flex items-center gap-2 text-[11px] text-emerald-300/90">
            <CircleDot className="size-3 animate-pulse" />
            dueGame CLUSTER #07 · ONLINE
          </div>
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-xl">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
              <div className="hud-tag mb-4">FINAL TRANSMISSION FROM EARTH</div>
              <h1 className="text-5xl font-black leading-[1.08] text-slate-50 md:text-6xl">
                方舟纪元
              </h1>
              <p className="disp mt-2 text-lg font-semibold tracking-[0.2em] text-cyan-300/90 md:text-xl">
                EARTH&apos;S FINAL HOUR · 科技挂机
              </p>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-400">
                地核裂解已不可逆。你是「方舟计划」的总指挥官——在母星化为星尘之前,
                重建工业、点亮科技树、选择文明的飞升形态,然后点火逃离。
                这是一款慢热的联机挂机游戏:即使你离开,方舟也会为你继续运转。
              </p>
            </motion.div>

            {/* 登录卡片 */}
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
              className="panel mt-8 rounded-lg p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="hud-tag">ACCESS TERMINAL · 身份验证</div>
                <ShieldCheck className="size-4 text-emerald-300/70" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-slate-400">账号 / Callsign</span>
                  <input
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder="例如 nova_pioneer"
                    autoComplete="username"
                    className="num w-full rounded border border-cyan-300/15 bg-black/30 px-3 py-2.5 text-sm text-cyan-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:bg-cyan-950/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-slate-400">密码 / Passcode</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 4 位"
                    autoComplete="current-password"
                    className="num w-full rounded border border-cyan-300/15 bg-black/30 px-3 py-2.5 text-sm text-cyan-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:bg-cyan-950/20"
                  />
                </label>
              </div>
              {authError && (
                <div className="mt-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{authError}</div>
              )}
              <button
                type="submit"
                disabled={authBusy}
                className="group mt-5 flex w-full items-center justify-center gap-2 rounded border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 text-sm font-bold tracking-widest text-cyan-100 transition hover:bg-cyan-400/20 hover:shadow-[0_0_24px_rgba(34,211,238,0.25)] disabled:opacity-60"
              >
                {authBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 正在连接方舟网络…
                  </>
                ) : (
                  <>
                    连接方舟网络
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                账号不存在时将自动注册 · 一个账号绑定唯一 UID · 存档云端同步
              </p>
            </motion.form>

            {/* 特性 */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
                  className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3.5"
                >
                  <f.icon className="mt-0.5 size-4.5 shrink-0 text-cyan-300/80" />
                  <div>
                    <div className="text-[13px] font-bold text-slate-200">{f.title}</div>
                    <div className="mt-0.5 text-[11px] leading-4.5 text-slate-500">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <footer className="num flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] tracking-wider text-slate-600">
          <span>PROTOCOL v0.1.0</span>
          <span>FRONTEND · REACT + ZUSTAND</span>
          <span>BACKEND · dueGame / Go / MongoDB</span>
          <span>CONFIG · LUBAN</span>
        </footer>
      </div>
    </div>
  );
}
