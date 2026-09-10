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

export type TabId = "overview" | "energy" | "build" | "research" | "routes" | "launch" | "leaderboard" | "chronicle";
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
  epitaph?: string;
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

function submitLeagueScore(save: SaveState, user: UserInfo, escaped: boolean) {
  const runScore = Math.floor(save.meta.totalEnergy / 1000 + save.meta.cores * 50);
  void api.league
    .submitScore({
      uid: save.uid,
      account: user.account,
      run_score: runScore,
      escaped,
      run_id: save.run.runId,
      route: save.run.route,
      cores: save.meta.cores,
      totalEnergy: save.meta.totalEnergy,
      bestRemainSec: save.meta.bestRemainSec,
      totalClicks: save.meta.totalClicks,
      runs: save.meta.runs,
      escapes: save.meta.escapes,
    })
    .catch(() => {});
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
    if (save && !save.meta.history) save.meta.history = [];
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
          const reward = E.computeReward(save, false, now);
          save.meta.cores += reward.total;
          save.meta.runs += 1;
          save.meta.deaths += 1;
          const record = E.makeRunRecord(save, false, reward, now);
          record.epitaph = E.epitaphFor(record);
          E.pushHistory(save.meta, record);
          summary = { escaped: false, reward, remainSec: 0, runId: save.run.runId, epitaph: record.epitaph };
          submitLeagueScore(save, user, false);
          save.run = E.newRun(save.meta.runs + 1, save.meta, now);
          logs.push(logOf("休眠期间,母星抵达了它的终点。", "danger"));
          logs.push(logOf(`文明墓碑已立于编年史:「${record.epitaph}」`, "danger"));
        } else if (result.seconds > 60) {
          offline = { ...result, died: false };
          logs.push(logOf(`休眠 ${Math.floor(result.seconds / 60)} 分钟,方舟持续运转。`, "info"));
        }
      } else {
        save.lastTickAt = now;
      }
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
      if (s.cinematic || s.summary) return;
      const now = Date.now();
      const save = s.save;
      let dt = (now - save.lastTickAt) / 1000;
      if (dt <= 0) return;
      if (dt > 600) dt = 600;
      E.applyTick(save, s.derived, dt);
      save.lastTickAt = now;

      if (s.derived.autoClicks > 0) {
        const p = (Math.random() < s.derived.crit ? 2 : 1) * s.derived.autoClicks * dt;
        if (p > 0) {
          const add = Math.floor(p);
          if (add > 0) save.run.res.energy += add * s.derived.clickPower;
        }
      }

      if (now >= save.run.nextEventAt && !s.crate) {
        const pool = save.run.route ? RANDOM_EVENTS : RANDOM_EVENTS.filter((e) => !e.route);
        if (pool.length) {
          const ev = pool[Math.floor(Math.random() * pool.length)];
          const gain = Math.max(s.derived.rates.energy * 90, 200);
          save.run.res.energy += gain;
          pushLog(`随机事件「${ev.name}」: ${ev.desc} 获得 ${fmt(gain)} 能量。`, "info");
          pushToast(ev.name, ev.desc, "info");
          sfx.event();
        }
        const gap = EVENT_MIN_GAP + Math.random() * (EVENT_MAX_GAP - EVENT_MIN_GAP);
        save.run.nextEventAt = now + gap * 1000;
      }

      for (const se of STORY_EVENTS) {
        if (save.run.firedStories.includes(se.id)) continue;
        if (!se.cond(save)) continue;
        save.run.firedStories.push(se.id);
        pushLog(se.text, "story");
        pushToast(se.title, se.text, "story");
      }

      if (Math.random() < 0.0008 && !s.crate) {
        set({ crate: { id: Date.now(), expiresAt: now + 25_000 } });
        pushLog("近地轨道出现漂流补给舱,快去回收!", "warn");
      }
      if (s.crate && now > s.crate.expiresAt) set({ crate: null });

      if (now >= save.run.deadlineAt) {
        const reward = E.computeReward(save, false, now);
        save.meta.cores += reward.total;
        save.meta.runs += 1;
        save.meta.deaths += 1;
        const record = E.makeRunRecord(save, false, reward, now);
        record.epitaph = E.epitaphFor(record);
        E.pushHistory(save.meta, record);
        const runId = save.run.runId;
        const user = s.user;
        if (user) submitLeagueScore(save, user, false);
        save.run = E.newRun(save.meta.runs + 1, save.meta, now);
        set({
          save: { ...save },
          derived: E.computeDerived(save),
          summary: { escaped: false, reward, remainSec: 0, runId, epitaph: record.epitaph },
          crate: null,
          now,
        });
        pushLog(`第 ${runId} 纪元终结:地球解体。文明墓碑「${record.epitaph}」`, "danger");
        sfx.explosion();
        set({ cinematic: "explosion" });
        void get().saveNow();
        return;
      }

      set({ save: { ...save }, now, derived: E.computeDerived(save) });
    },

    clickCore() {
      const s = get();
      if (!s.save || !s.derived) return null;
      const crit = Math.random() < s.derived.crit;
      const amount = s.derived.clickPower * (crit ? 2 : 1);
      s.save.run.res.energy += amount;
      s.save.run.stats.energyTotal += amount;
      s.save.meta.totalEnergy += amount;
      s.save.run.stats.clicks += 1;
      s.save.meta.totalClicks += 1;
      if (crit) sfx.crit();
      else sfx.click();
      touch();
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
      if (s.user) submitLeagueScore(save, s.user, true);
      sfx.launch();
      set({ cinematic: "launch" });
      void get().saveNow();
    },

    collectCrate() {
      const s = get();
      const save = s.save;
      if (!save || !s.crate) return;
      const d = E.computeDerived(save);
      const secs = 180;
      const r = save.run.res;
      const gains: string[] = [];
      (["energy", "material", "research"] as ResourceKey[]).forEach((k) => {
        const v = Math.max(d.rates[k] * secs, k === "energy" ? 100 : 20);
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
      const record = E.makeRunRecord(save, escaped, reward, now);
      if (!escaped) record.epitaph = E.epitaphFor(record);
      E.pushHistory(save.meta, record);
      if (s.user) submitLeagueScore(save, s.user, escaped);
      save.run = E.newRun(save.meta.runs + 1, save.meta, now);
      set({
        cinematic: null,
        summary: { escaped, reward, remainSec, runId, epitaph: record.epitaph || undefined },
        save: { ...save },
        derived: E.computeDerived(save),
        now,
      });
      pushLog(
        escaped
          ? `第 ${runId} 纪元:方舟点火成功,文明延续。获得星核 ×${reward.total}。`
          : `第 ${runId} 纪元:地球化为星尘。逃生舱带回星核 ×${reward.total}。墓碑:「${record.epitaph}」`,
        escaped ? "success" : "danger",
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

export const AUTOSAVE_MS = 8000;
export const TICK_MS = GLOBAL.tickMs;
