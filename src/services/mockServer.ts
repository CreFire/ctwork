/**
 * ============================================================
 * 模拟游戏服务器(前端内置,接口与正式后端一一对应)
 * ============================================================
 * 正式环境替换为:dueGame(Go 游戏服务器框架)+ MongoDB
 *   - POST /api/v1/auth/login          登录即注册(账号+密码)
 *   - GET  /api/v1/player/profile      获取账号信息(token 鉴权)
 *   - GET  /api/v1/player/save         拉取存档
 *   - POST /api/v1/player/save         推送存档(节流)
 * MongoDB 集合见 docs/ARCHITECTURE.md。
 * ============================================================
 */

const LS_USERS = "ark_server_users";
const LS_SAVE_PREFIX = "ark_server_save_";
const LS_SESSION = "ark_session_v1";

export interface UserRec {
  uid: string;
  account: string;
  passHash: string;
  createdAt: number;
}

export interface AuthResult {
  token: string;
  uid: string;
  account: string;
  isNew: boolean;
  createdAt: number;
}

const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 260));

/** 演示用散列(正式环境由后端 bcrypt/argon2 处理) */
function hashPass(account: string, pass: string): string {
  let h = 5381;
  const s = `ark::${account}::${pass}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "h" + h.toString(36);
}

function loadUsers(): Record<string, UserRec> {
  try {
    return JSON.parse(localStorage.getItem(LS_USERS) || "{}");
  } catch {
    return {};
  }
}

function storeUsers(users: Record<string, UserRec>) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

function makeUid(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0");
  return `U${t}${r}`.toUpperCase();
}

export const server = {
  /** 登录即注册:账号不存在自动创建,一个玩家绑定一个 uid */
  async loginOrRegister(account: string, password: string): Promise<AuthResult> {
    await latency();
    account = account.trim();
    if (!account || !password) throw new ApiError(400, "请输入账号与密码");
    if (account.length < 3) throw new ApiError(400, "账号至少 3 个字符");
    if (password.length < 4) throw new ApiError(400, "密码至少 4 位");
    const users = loadUsers();
    const key = account.toLowerCase();
    let rec = users[key];
    let isNew = false;
    if (!rec) {
      rec = { uid: makeUid(), account, passHash: hashPass(account, password), createdAt: Date.now() };
      users[key] = rec;
      storeUsers(users);
      isNew = true;
    } else if (rec.passHash !== hashPass(account, password)) {
      throw new ApiError(401, "密码错误:该账号已存在,请输入正确的密码");
    }
    const token = btoa(`${rec.uid}:${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(LS_SESSION, JSON.stringify({ token, uid: rec.uid }));
    return { token, uid: rec.uid, account: rec.account, isNew, createdAt: rec.createdAt };
  },

  /** 通过本地会话恢复登录 */
  resolveSession(): { uid: string } | null {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
      return s && s.uid ? { uid: s.uid } : null;
    } catch {
      return null;
    }
  },

  async profile(uid: string): Promise<{ uid: string; account: string; createdAt: number } | null> {
    await latency();
    const users = loadUsers();
    for (const k of Object.keys(users)) {
      const u = users[k];
      if (u.uid === uid) return { uid: u.uid, account: u.account, createdAt: u.createdAt };
    }
    return null;
  },

  async loadSave(uid: string): Promise<string | null> {
    await latency();
    return localStorage.getItem(LS_SAVE_PREFIX + uid);
  },

  async writeSave(uid: string, json: string): Promise<void> {
    localStorage.setItem(LS_SAVE_PREFIX + uid, json);
  },

  async wipeSave(uid: string): Promise<void> {
    await latency();
    localStorage.removeItem(LS_SAVE_PREFIX + uid);
  },

  logout() {
    localStorage.removeItem(LS_SESSION);
  },
};

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
