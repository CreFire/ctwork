/**
 * 内存存储 - 排行榜后端存储层
 * 设计为可替换为 MongoDB (见 mongoStore.mjs)
 * 接口与 ARCHITECTURE.md 中 MongoDB 集合设计对齐
 */

class MemoryStore {
  constructor() {
    this.users = new Map(); // account(lower) -> {uid, account, passHash, createdAt}
    this.saves = new Map(); // uid -> {payload, version, updatedAt}
    this.leagueRuns = new Map(); // uid -> best run {uid, run_score, escaped, run_id, route, cores, account, ts, bestRemainSec, totalEnergy}
    this.leagueHistory = []; // 所有提交历史，用于审计
    this.sessions = new Map(); // token -> uid
  }

  // ---- Users ----
  getUserByAccount(account) {
    return this.users.get(account.toLowerCase()) || null;
  }

  getUserByUid(uid) {
    for (const u of this.users.values()) {
      if (u.uid === uid) return u;
    }
    return null;
  }

  createUser(user) {
    this.users.set(user.account.toLowerCase(), user);
    return user;
  }

  // ---- Saves ----
  getSave(uid) {
    return this.saves.get(uid) || null;
  }

  setSave(uid, payload, version = 1) {
    this.saves.set(uid, {
      payload,
      version,
      updatedAt: Date.now(),
    });
  }

  deleteSave(uid) {
    this.saves.delete(uid);
  }

  // ---- League ----
  submitRun(entry) {
    const { uid } = entry;
    const existing = this.leagueRuns.get(uid);
    
    // 保留最高分
    if (!existing || entry.run_score > existing.run_score) {
      this.leagueRuns.set(uid, entry);
    }
    
    // 记录历史
    this.leagueHistory.push({ ...entry, submittedAt: Date.now() });
    // 限制历史长度
    if (this.leagueHistory.length > 10000) {
      this.leagueHistory = this.leagueHistory.slice(-5000);
    }
    
    return this.leagueRuns.get(uid);
  }

  getTop(limit = 100) {
    const all = Array.from(this.leagueRuns.values());
    all.sort((a, b) => b.run_score - a.run_score);
    return all.slice(0, limit).map((e, idx) => ({
      rank: idx + 1,
      ...e,
    }));
  }

  getRank(uid) {
    const all = Array.from(this.leagueRuns.values());
    all.sort((a, b) => b.run_score - a.run_score);
    const idx = all.findIndex(e => e.uid === uid);
    if (idx === -1) return null;
    return {
      rank: idx + 1,
      total: all.length,
      entry: { ...all[idx], rank: idx + 1 },
    };
  }

  getTopWithMyRank(uid, limit = 100) {
    const top = this.getTop(limit);
    const myRank = this.getRank(uid);
    
    // 如果我在 Top N 之外，额外返回我的排名
    if (myRank && myRank.rank > limit) {
      return {
        top,
        myRank: myRank.entry,
        myRankNumber: myRank.rank,
        total: myRank.total,
      };
    }
    
    return {
      top,
      myRank: myRank?.entry || null,
      myRankNumber: myRank?.rank || null,
      total: myRank?.total || top.length,
    };
  }

  // ---- Sessions ----
  createSession(token, uid) {
    this.sessions.set(token, { uid, createdAt: Date.now() });
  }

  getSession(token) {
    return this.sessions.get(token) || null;
  }

  deleteSession(token) {
    this.sessions.delete(token);
  }

  // ---- Stats ----
  getStats() {
    return {
      users: this.users.size,
      saves: this.saves.size,
      leagueEntries: this.leagueRuns.size,
      history: this.leagueHistory.length,
      sessions: this.sessions.size,
    };
  }

  // ---- Persistence (文件备份) ----
  toJSON() {
    return {
      users: Array.from(this.users.entries()),
      saves: Array.from(this.saves.entries()),
      leagueRuns: Array.from(this.leagueRuns.entries()),
      leagueHistory: this.leagueHistory.slice(-1000), // 仅保存最近1000条历史
    };
  }

  fromJSON(data) {
    try {
      if (data.users) this.users = new Map(data.users);
      if (data.saves) this.saves = new Map(data.saves);
      if (data.leagueRuns) this.leagueRuns = new Map(data.leagueRuns);
      if (data.leagueHistory) this.leagueHistory = data.leagueHistory;
      console.log(`[Store] Restored: ${this.users.size} users, ${this.leagueRuns.size} league entries`);
    } catch (e) {
      console.warn(`[Store] Restore failed: ${e.message}`);
    }
  }
}

// 单例
const store = new MemoryStore();

export default store;
