import { create } from "zustand";
import {
  BUILDING_MAP,
  CLICK_UPGRADE_MAP,
  CORE_UPGRADE_MAP,
  EVENT_MAX_GAP,
  EVENT_MIN_GAP,
  GLOBAL,
  RANDOM_EVENTS,
  RESEARCH_MAP,
  ROUTE_UPGRADE_MAP,
  ROUTES,
  STORY_EVENTS,
  type ResourceKey,
  type RouteId,
} from "./config";
import * as E from "./engine";
import { fmt } from "./fmt";
import { api } from "@/services/api";
import { sfx } from "./sound";
import type { Derived, OfflineResult, RewardBreakdown, SaveState } from "./engine";

export type TabId = "overview" | "energy" | "build" | "research" | "routes" | "launch" | "leaderboard";
export type Tone = "info" | "success" | "warn" | "danger" | "story";

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  tone: Tone;
}
export interface Toast {
  id: number;
  title: string;
  text: string;
  tone: Tone;
}
export interface UserInfo {
  uid: string;
  account: string;
  createdAt: number;
}
export interface RunSummary {
  escaped: boolean;
  reward: RewardBreakdown;
  remainSec: number;
  runId: number;
}
export interface OfflineReport {
  seconds: number;
  gains: Record<ResourceKey, number>;
  died: boolean;
}

let logSeq = 1;
let toastSeq = 1;

interface GameStore {
  phase: "auth" | "boot" | "playing";
  authBusy: boolean;
  authError: string | null;
  user: UserInfo | null;
  isNewPlayer: boolean;
  save: SaveState | null;
  derived: Derived | null;
  now: number;
  tab: TabId;
  logs: LogEntry[];
  toasts: Toast[];
  crate: { id: number; expiresAt: number } | null;
  cinematic: "explosion" | "launch" | null;
  summary: RunSummary | null;
  offline: OfflineReport | null;
  syncDirtyAt: number;
  syncSavedAt: number;
  muted: boolean;
  pendingRoute: RouteId | null;

  login: (account: string, password: string) => Promise<void>;
  reconnect: () => Promise<void>;
  logout: () => void;
  setTab: (t: TabId) => void;
  setMuted: (m: boolean) => void;
  tick: () => void;
  clickCore: () => { amount: number; crit: boolean } | null;
  buyBuilding: (id: string, times?: number) => void;
  buyResearch: (id: string) => void;
  buyClickUp: (id: string) => void;
  chooseRoute: (rt: RouteId, confirmed?: boolean) => void;
  cancelRoute: () => void;
  buyRouteUp: (id: string) => void;
  buyCoreUp: (id: string) => void;
  launch: () => void;
  collectCrate: () => void;
  cinematicDone: () => void;
  closeSummary: () => void;
  closeOffline: () => void;
  saveNow: () => Promise<void>;
  wipeAll: () => Promise<void>;
}

function logOf(text: string, tone: Tone = "info"): LogEntry {
  return { id: logSeq++, time: Date.now(), text, tone };
}

export const useGame = create<GameStore>((set, get) => {
  const pushLog = (text: string, tone: Tone = "info") =>
    set((s) => ({ logs: [...s.logs.slice(-79), logOf(text, tone)] }));

  const pushToast = (title: string, text: string, tone: Tone = "info") => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, title, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4800);
  };

  const touch = () => {
    const s = get();
    if (!s.save) return;
    const d = E.computeDerived(s.save);
    set({ save: { ...s.save }, derived: d, syncDirtyAt: Date.now(), now: Date.now() });
  };

  const boot = async (user: UserInfo, isNew: boolean) => {
    const now = Date.now();
    let save: SaveState | null = null;
    try {
      const json = await api.loadSave(user.uid);
      if (json) save = JSON.parse(json) as SaveState;
    } catch {
      save = null;
    }
    const logs: LogEntry[] = [];
    let offline: OfflineReport | null = null;
    let summary: RunSummary | null = null;

    if (!save) {
      save = E.newSave(user.uid, now);
      logs.push(logOf(`身份验证完成,UID ${user.uid} 已绑定。`, "success"));
      logs.push(logOf("—— 地球解体倒计时,已启动 ——", "story"));
      logs.push(logOf("「欢迎回来,指挥官。方舟停泊在近地轨道,一切听你调遣。」", "story"));
      await api.writeSave(user.uid, JSON.stringify(save));
    } else {
      const away = now - save.lastTickAt;
      if (away > 5000) {
        const result: OfflineResult = E.applyOffline(save, now);
        if (result.died) {
          // 休眠期间地球已毁灭 —— 直接结算轮回
          const reward = E.computeReward(save, false, now);
          save.meta.cores += reward.total;
          save.meta.runs += 1;
          save.meta.deaths += 1;
          summary = { escaped: false, reward, remainSec: 0, runId: save.run.runId };
          // 提交到排行榜 (死亡也提交)
          void api.league.submitScore({
            uid: save.uid,
            account: user.account,
            run_score: Math.floor(save.meta.totalEnergy / 1000 + save.meta.cores * 50),
            escaped: false,
            run_id: save.run.runId,
            route: save.run.route,
            cores: save.meta.cores,
            totalEnergy: save.meta.totalEnergy,
            bestRemainSec: save.meta.bestRemainSec,
            totalClicks: save.meta.totalClicks,
            runs: save.meta.runs,
            escapes: save.meta.escapes,
          }).catch(() => {});
          save.run = E.newRun(save.meta.runs + 1, save.meta, now);
          logs.push(logOf("休眠期间,母星抵达了它的终点。", "danger"));
        } else if (result.seconds > 60) {
          offline = { ...result, died: false };
          logs.push(logOf(`休眠 ${Math.floor(result.seconds / 60)} 分钟,方舟持续运转。`, "info"));
        }
      } else {
        save.lastTickAt = now;
      }
      // 下次事件时间来自全局配置，若存档过旧则重置为 30s 后
      save.run.nextEventAt = Math.max(save.run.nextEventAt, now + 30_000);
      logs.push(logOf(`欢迎回来,指挥官。第 ${save.run.runId} 纪元仍在继续。`, "info"));
    }

    set({
      phase: "playing",
      authBusy: false,
      authError: null,
      user,
      isNewPlayer: isNew,
      save,
      derived: E.computeDerived(save),
      logs,
      offline,
      summary,
      cinematic: null,
      crate: null,
      tab: "overview",
      now,
      syncDirtyAt: 0,
      syncSavedAt: Date.now(),
    });
    void get().saveNow();
  };

  return {
    phase: "auth",
    authBusy: false,
    authError: null,
    user: null,
    isNewPlayer: false,
    save: null,
    derived: null,
    now: Date.now(),
    tab: "overview",
    logs: [],
    toasts: [],
    crate: null,
    cinematic: null,
    summary: null,
    offline: null,
    syncDirtyAt: 0,
    syncSavedAt: 0,
    muted: false,
    pendingRoute: null,

    async login(account, password) {
      set({ authBusy: true, authError: null });
      try {
        const res = await api.loginOrRegister(account, password);
        await boot({ uid: res.uid, account: res.account, createdAt: res.createdAt }, res.isNew);
      } catch (e) {
        set({ authBusy: false, authError: e instanceof Error ? e.message : "连接失败" });
      }
    },

    async reconnect() {
      const session = api.resolveSession();
      if (!session) return;
      set({ phase: "boot" });
      const profile = await api.profile(session.uid);
      if (!profile) {
        api.logout();
        set({ phase: "auth" });
        return;
      }
      await boot(profile, false);
    },

    logout() {
      void get().saveNow();
      api.logout();
      set({
        phase: "auth",
        user: null,
        save: null,
        derived: null,
        logs: [],
        toasts: [],
        summary: null,
        offline: null,
        cinematic: null,
        tab: "overview",
      });
    },

    setTab: (t) => set({ tab: t }),
    setMuted: (m) => {
      sfx.setMuted(m);
      set({ muted: m });
    },

    tick() {
      const s = get();
      if (s.phase !== "playing" || !s.save || !s.derived) return;
      if (s.cinematic || s.summary) return; // 过场与结算期间时间冻结
      const now = Date.now();
      const save = s.save;
      let dt = (now - save.lastTickAt) / 1000;
      if (dt <= 0) return;
      dt = Math.min(dt, 30);
      E.applyTick(save, s.derived, dt);
      save.lastTickAt = now;

      // 倒计时剧情
      const remainSec = (save.run.deadlineAt - now) / 1000;
      for (const ev of STORY_EVENTS) {
        if (!save.run.firedStories.includes(ev.id) && remainSec <= ev.remainSec) {
          save.run.firedStories.push(ev.id);
          pushLog(ev.text, ev.tone === "info" ? "story" : ev.tone);
          if (ev.tone === "danger") {
            sfx.alarm();
            pushToast("方舟防御网络", ev.text, "danger");
          }
        }
      }

      // 随机事件
      if (now >= save.run.nextEventAt) {
        save.run.nextEventAt = now + (EVENT_MIN_GAP + Math.random() * (EVENT_MAX_GAP - EVENT_MIN_GAP)) * 1000;
        const pool = s.crate ? RANDOM_EVENTS.filter((e) => e.kind !== "crate") : RANDOM_EVENTS;
        const ev = pool[Math.floor(Math.random() * pool.length)];
        if (ev.kind === "crate") {
          set({ crate: { id: Date.now(), expiresAt: now + GLOBAL.crateLifeSeconds * 1000 } });
          pushLog(ev.text, "success");
          sfx.event();
        } else if (ev.kind === "deadline" && ev.deadlineAdd) {
          save.run.deadlineAt += ev.deadlineAdd * 1000;
          pushLog(`${ev.name}:${ev.text}(+${ev.deadlineAdd}秒)`, "story");
          pushToast(ev.name, `倒计时 +${ev.deadlineAdd} 秒`, "info");
          sfx.event();
        } else if (ev.res && ev.seconds !== undefined) {
          const r = save.run.res;
          const d = E.computeDerived(save);
          let amount = d.rates[ev.res] * ev.seconds;
          if (amount < 0) amount = -Math.min(Math.abs(amount), r[ev.res]);
          r[ev.res] = Math.max(0, r[ev.res] + amount);
          const sign = amount >= 0 ? "+" : "-";
          pushLog(`${ev.name}:${ev.text}(${sign}${fmt(Math.abs(amount))})`, ev.tone);
          pushToast(ev.name, `${sign}${fmt(Math.abs(amount))} ${ev.res === "energy" ? "能量" : ev.res === "material" ? "物资" : "科研"}`, ev.tone);
          sfx.event();
        }
      }

      // 补给舱过期
      if (s.crate && now > s.crate.expiresAt) {
        set({ crate: null });
        pushLog("漂流补给舱已越过回収窗口,错过了。", "warn");
      }

      // 地球毁灭判定
      if (now >= save.run.deadlineAt) {
        sfx.alarm();
        set({ cinematic: "explosion", now });
        void get().saveNow();
        return;
      }

      set({ save: { ...save }, derived: E.computeDerived(save), now, syncDirtyAt: now });
    },

    clickCore() {
      const s = get();
      const save = s.save;
      const d = s.derived;
      if (!save || !d || s.cinematic || s.summary) return null;
      const crit = Math.random() < d.crit;
      const amount = d.clickPower * (crit ? GLOBAL.critMult : 1);
      save.run.res.energy += amount;
      save.run.stats.energyTotal += amount;
      save.meta.totalEnergy += amount;
      save.run.stats.clicks += 1;
      save.meta.totalClicks += 1;
      if (crit) sfx.crit();
      else sfx.click();
      set({ syncDirtyAt: Date.now() });
      return { amount, crit };
    },

    buyBuilding(id, times = 1) {
      const s = get();
      const save = s.save;
      if (!save) return;
      const def = BUILDING_MAP.get(id);
      if (!def || !E.isBuildingUnlocked(def, save)) return;
      let bought = 0;
      for (let i = 0; i < times; i++) {
        const owned = save.run.buildings[id] ?? 0;
        const cost = E.scaleCost(def.baseCost, def.scale, owned);
        if (!E.canAfford(save, cost)) break;
        E.payCost(save, cost);
        save.run.buildings[id] = owned + 1;
        bought++;
        if ((owned + 1) % GLOBAL.milestoneEvery === 0) {
          pushLog(`「${def.name}」数量达到 ${owned + 1},产出倍率提升!`, "success");
        }
      }
      if (bought === 0) {
        sfx.error();
        return;
      }
      if ((save.run.buildings[id] ?? 0) === bought) pushLog(`「${def.name}」建造完成,开始运转。`, "info");
      sfx.buy();
      touch();
    },

    buyResearch(id) {
      const s = get();
      const save = s.save;
      if (!save) return;
      const def = RESEARCH_MAP.get(id);
      if (!def || E.researchAvailable(id, save) !== "open") return;
      if (!E.canAfford(save, def.cost)) {
        sfx.error();
        return;
      }
      E.payCost(save, def.cost);
      save.run.research[id] = true;
      let text = `科技完成:「${def.name}」。`;
      for (const e of def.effects) {
        if (e.k === "enableRoute") text += ` 科技路线「${ROUTES.find((r) => r.id === e.route)?.name}」已解锁。`;
        if (e.k === "final") text += " 方舟,随时可以点火。";
        if (e.k === "countdown") save.run.deadlineAt += e.v * 1000;
      }
      pushLog(text, "success");
      if (def.quote) pushLog(`「${def.quote}」`, "story");
      sfx.research();
      touch();
    },

    buyClickUp(id) {
      const s = get();
      const save = s.save;
      if (!save) return;
      const def = CLICK_UPGRADE_MAP.get(id);
      if (!def) return;
      const lvl = save.run.clickUp[id] ?? 0;
      if (lvl >= def.max) return;
      const cost = { energy: Math.ceil(def.baseCost * Math.pow(def.scale, lvl)) };
      if (!E.canAfford(save, cost)) {
        sfx.error();
        return;
      }
      E.payCost(save, cost);
      save.run.clickUp[id] = lvl + 1;
      sfx.buy();
      touch();
    },

    chooseRoute(rt, confirmed = false) {
      const s = get();
      const save = s.save;
      if (!save) return;
      const def = ROUTES.find((r) => r.id === rt);
      if (!def) return;
      if (!save.run.research[def.requireResearch]) {
        sfx.error();
        return;
      }
      if (save.run.route === rt) {
        set({ pendingRoute: null });
        return;
      }
      if (save.run.route && !confirmed) {
        set({ pendingRoute: rt });
        return;
      }
      save.run.route = rt;
      save.run.res.special = 0;
      save.run.routeUp = {};
      set({ pendingRoute: null });
      pushLog(`科技路线确立:「${def.name} · ${def.title}」。${def.specialName}开始汇聚。`, "story");
      pushToast("路线确立", `${def.name} — ${def.title}`, "success");
      sfx.research();
      touch();
    },

    cancelRoute: () => set({ pendingRoute: null }),

    buyRouteUp(id) {
      const s = get();
      const save = s.save;
      if (!save || !save.run.route) return;
      const def = ROUTE_UPGRADE_MAP.get(id);
      if (!def || def.route !== save.run.route) return;
      const lvl = save.run.routeUp[id] ?? 0;
      if (lvl >= def.max) return;
      const cost = { special: E.specialCost(def.baseCost, def.scale, lvl) };
      if (!E.canAfford(save, cost)) {
        sfx.error();
        return;
      }
      E.payCost(save, cost);
      save.run.routeUp[id] = lvl + 1;
      sfx.buy();
      touch();
    },

    buyCoreUp(id) {
      const s = get();
      const save = s.save;
      if (!save) return;
      const def = CORE_UPGRADE_MAP.get(id);
      if (!def) return;
      const lvl = save.meta.coreUp[id] ?? 0;
      if (lvl >= def.max) return;
      const cost = E.coreCost(def.base, def.inc, lvl);
      if (save.meta.cores < cost) {
        sfx.error();
        return;
      }
      save.meta.cores -= cost;
      save.meta.coreUp[id] = lvl + 1;
      if (def.effectPer.k === "countdown") save.run.deadlineAt += def.effectPer.v * 1000;
      pushLog(`星核回响:「${def.name}」提升至 ${lvl + 1} 级。`, "success");
      sfx.research();
      touch();
    },

    launch() {
      const s = get();
      const save = s.save;
      if (!save) return;
      const ready = E.launchReady(save);
      if (!ready.ok) {
        sfx.error();
        return;
      }
      save.run.res.energy -= GLOBAL.launchEnergyReq;
      save.run.res.material -= GLOBAL.launchMaterialReq;
      sfx.launch();
      set({ cinematic: "launch" });
      void get().saveNow();
    },

    collectCrate() {
      const s = get();
      const save = s.save;
      if (!save || !s.crate) return;
      const d = E.computeDerived(save);
      // 补给舱收益秒数来自 tb_global.csv crate_min_gain_seconds
      const secs = (GLOBAL as any).crateMinGainSeconds ?? 180;
      const r = save.run.res;
      const gains: string[] = [];
      (["energy", "material", "research"] as ResourceKey[]).forEach((k) => {
        // 最小保底收益来自配置，若产出为0则给予固定值
        const minGain = k === "energy" ? 100 : 20;
        const v = Math.max(d.rates[k] * secs, minGain);
        r[k] += v;
        gains.push(`+${fmt(v)} ${k === "energy" ? "能量" : k === "material" ? "物资" : "科研"}`);
      });
      set({ crate: null });
      pushLog(`回收成功:补给舱完好无损。${gains.join(",")}`, "success");
      pushToast("漂流补给舱", gains.join(" · "), "success");
      sfx.research();
      touch();
    },

    cinematicDone() {
      const s = get();
      const save = s.save;
      const user = s.user;
      if (!save || !s.cinematic) return;
      const escaped = s.cinematic === "launch";
      const now = Date.now();
      const reward = E.computeReward(save, escaped, now);
      const remainSec = Math.max(0, (save.run.deadlineAt - now) / 1000);
      save.meta.cores += reward.total;
      save.meta.runs += 1;
      if (escaped) {
        save.meta.escapes += 1;
        save.meta.bestRemainSec = Math.max(save.meta.bestRemainSec, remainSec);
      } else {
        save.meta.deaths += 1;
      }
      const runId = save.run.runId;

      // 提交到排行榜后端 (真实或模拟)
      if (user) {
        const score = Math.floor(save.meta.totalEnergy / 1000 + save.meta.cores * 50 + runId * 10);
        void api.league
          .submitScore({
            uid: save.uid,
            account: user.account,
            run_score: score,
            escaped,
            run_id: runId,
            route: save.run.route,
            cores: save.meta.cores,
            totalEnergy: save.meta.totalEnergy,
            bestRemainSec: save.meta.bestRemainSec,
            totalClicks: save.meta.totalClicks,
            runs: save.meta.runs,
            escapes: save.meta.escapes,
          })
          .then((res: any) => {
            if (res?.rank) {
              pushLog(`排行榜更新: 当前排名 #${res.rank}`, "success");
            }
          })
          .catch(() => {});
      }

      save.run = E.newRun(save.meta.runs + 1, save.meta, now);
      set({
        cinematic: null,
        summary: { escaped, reward, remainSec, runId },
        save: { ...save },
        derived: E.computeDerived(save),
        now,
      });
      pushLog(
        escaped
          ? `第 ${runId} 纪元:方舟点火成功,文明延续。获得星核 ×${reward.total}。`
          : `第 ${runId} 纪元:地球化为星尘。逃生舱带回星核 ×${reward.total}。`,
        escaped ? "success" : "danger"
      );
      void get().saveNow();
    },

    closeSummary() {
      set({ summary: null });
      void get().saveNow();
    },
    closeOffline: () => set({ offline: null }),

    async saveNow() {
      const s = get();
      if (!s.user || !s.save) return;
      try {
        await api.writeSave(s.user.uid, JSON.stringify(s.save));
        set({ syncSavedAt: Date.now() });
      } catch {
        /* 静默失败,下个周期重试 */
      }
    },

    async wipeAll() {
      const s = get();
      if (!s.user) return;
      await api.wipeSave(s.user.uid);
      const save = E.newSave(s.user.uid, Date.now());
      await api.writeSave(s.user.uid, JSON.stringify(save));
      set({
        save,
        derived: E.computeDerived(save),
        summary: null,
        offline: null,
        cinematic: null,
        logs: [logOf("存档已重置,新的文明火种点燃。", "warn")],
        tab: "overview",
        now: Date.now(),
      });
    },
  };
});

/** 自动存档与Tick间隔来自 tb_global.csv */
export const AUTOSAVE_MS = (GLOBAL as any).autosaveMs ?? 8000;
export const TICK_MS = GLOBAL.tickMs;
