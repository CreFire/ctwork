# 排行榜后端 - 接入文档

## 概述

排行榜后端已完整实现，支持 **Mock (localStorage)** 与 **Real (Express + MemoryStore, 可替换为 MongoDB)** 双模式，通过 `VITE_API_URL` 环境变量无缝切换。

## 架构

```
前端 (React)
  ├── src/services/api.ts          # 统一 API 客户端，自动切换 Mock/Real
  ├── src/services/leaderboardService.ts # 业务层：获取/提交/模拟回退
  ├── src/game/leagueStore.ts      # Zustand 状态：Top榜、完整榜、我的排名、筛选
  ├── SidePanel.tsx                # 侧边栏迷你榜 (Top8)
  └── LeaderboardTab.tsx           # 完整排行榜页面 (Top100)

后端 (Node, 兼容 dueGame 协议)
  server/node/
  ├── src/index.mjs                # Express 主入口
  ├── config/lubanLoader.mjs       # Luban 配置加载 (权威)
  ├── storage/memoryStore.mjs      # 内存存储 (可替换 Mongo)
  ├── storage/fileStore.mjs        # 文件持久化 (开发环境)
  ├── services/leaderboard.mjs     # 排行榜核心逻辑 (LeagueActor)
  ├── services/antiCheat.mjs       # 反作弊校验
  ├── middleware/auth.mjs          # Bearer Token 认证
  ├── middleware/rateLimit.mjs     # 限流
  └── routes/
      ├── auth.mjs                 # POST /api/v1/auth/login
      ├── player.mjs               # GET/POST /api/v1/player/save
      └── league.mjs               # GET /api/v1/league/top, POST /submit, /stats, /season

后端 (Go, 架构预留)
  server/go/
  ├── cmd/server/main.go
  ├── internal/config/luban.go
  ├── internal/module/league/module.go
  └── internal/store/mongo/store.go
```

## API 协议

### 认证

**POST /api/v1/auth/login**

```json
// Request
{ "account": "test", "password": "1234" }

// Response
{
  "token": "base64...",
  "uid": "U...",
  "account": "test",
  "is_new": true,
  "created_at": 1234567890
}
```

- 账号不存在自动注册
- 一个账号绑定一个 UID
- Token 为 Base64，内存存储

**GET /api/v1/player/profile**

Header: `Authorization: Bearer <token>`

### 存档

**GET /api/v1/player/save**

Header: Bearer

**POST /api/v1/player/save**

```json
{ "payload": "{...}", "version": 1 }
```

- 校验版本号
- 校验资源增量上限 (Δres ≤ 理论最大 × Δt × 1.2)

### 排行榜

**GET /api/v1/league/top?limit=100&uid=xxx&route=machine&sortBy=run_score**

```json
{
  "top": [
    { "rank": 1, "uid": "U...", "account": "test", "run_score": 12345, "escaped": true, "route": "machine", "cores": 50, "ts": 1234567890 }
  ],
  "myRank": { "rank": 5, "uid": "U...", ... },
  "myRankNumber": 5,
  "total": 100,
  "limit": 100,
  "ts": 1234567890
}
```

- `limit`: 1-200, 默认 100
- `uid`: 可选，带上则返回我的排名
- `route`: 可选过滤 (machine, swarm, psionic)
- `sortBy`: run_score, totalEnergy, cores

**POST /api/v1/league/submit**

Header: Bearer

```json
{
  "uid": "U...",
  "account": "test",
  "run_score": 12345,
  "escaped": true,
  "run_id": 5,
  "route": "machine",
  "cores": 50,
  "totalEnergy": 1000000,
  "bestRemainSec": 1200
}
```

- 反作弊：分数上限 1e12，限流 10次/分钟
- 保留最高分 (best per uid)

**GET /api/v1/league/stats**

```json
{
  "leaderboard": { "totalPlayers": 100, "avgScore": 5000, "maxScore": 20000, "escapeRate": 0.3, "routeDistribution": {...} },
  "store": { "users": 10, "leagueEntries": 100 }
}
```

**GET /api/v1/league/season?days=7&limit=100**

赛季榜，按时间窗口过滤。

## 前端接入

### 1. 配置环境变量

`.env`

```bash
VITE_API_URL=http://localhost:3001
```

- 为空：Mock 模式，使用 localStorage 模拟排行榜
- 有值：Real 模式，请求真实后端

### 2. 启动后端

```bash
npm run server:dev
# 或
cd server/node && npm install && node src/index.mjs
```

后端监听 `0.0.0.0:3001`，健康检查 `http://localhost:3001/health`

### 3. 前端自动切换

`src/services/api.ts` 根据 `VITE_API_URL` 自动选择：

```ts
const USE_REAL_API = !!import.meta.env.VITE_API_URL;

if (USE_REAL_API) {
  fetch(`${API_URL}/api/v1/league/top`)
} else {
  // localStorage mock
}
```

`leaderboardService.ts` 提供回退：真实后端失败时自动使用模拟数据。

### 4. 状态管理

`useLeague` store：

```ts
const { top, myRank, fetch, submit } = useLeague();

// 获取榜单
await fetch(save, uid, account);

// 提交成绩 (轮回结束时自动调用)
await submit(save, account);
```

轮回结束时 `store.ts cinematicDone()` 自动提交：

```ts
void api.league.submitScore({ uid, run_score, escaped, ... })
```

### 5. UI 组件

- **SidePanel**: 迷你榜 Top8，显示 LIVE/MOCK 标识，30秒自动刷新
- **LeaderboardTab**: 完整榜 Top100，支持路线过滤、排序、查看我的排名

## 存储设计

### MemoryStore (当前)

```ts
users: Map<accountLower, {uid, account, passHash, createdAt}>
saves: Map<uid, {payload, version, updatedAt}>
leagueRuns: Map<uid, bestEntry>
leagueHistory: Array<allSubmissions>
sessions: Map<token, {uid, createdAt}>
```

- 文件持久化：`server/node/data/server_state.json`，30秒自动保存
- 适合单机/开发

### MongoDB (生产)

集合设计见 `ARCHITECTURE.md §2.2`：

| 集合 | 字段 | 索引 |
|---|---|---|
| `players` | _id(uid), account(唯一), pass_hash, created_at | unique(account) |
| `saves` | uid, payload, version, updated_at | unique(uid) |
| `league_run` | uid, run_score, escaped, run_id, route, cores, ts | run_score desc |

Go 实现已预留接口 `mongo.Store`，可无缝替换。

## 反作弊

见 `antiCheat.mjs`：

1. **资源增量上限**: `Δres ≤ maxRate × Δt × 1.2`
2. **分数上限**: `run_score ≤ 1e12`
3. **版本校验**: `save.version ≤ current Luban version`
4. **限流**: 
   - 登录 20次/分钟/IP
   - 存档 20次/10秒/用户
   - 提交 10次/分钟/用户
   - 全局 200次/分钟/IP
5. **账号校验**: 长度、字符集

## 配置驱动

排行榜分数计算与全局配置表 `tb_global.csv` 联动：

```ts
// 来自 Luban
rewardProdDivisor: 1000000
rewardTimeDivisor: 600
rewardBase: 3

// 分数公式 (与 engine.ts computeReward 同源)
prodPart = sqrt(energyTotal / rewardProdDivisor)
timePart = remainSec / rewardTimeDivisor
score = rewardBase + prodPart + timePart (逃生)
score = 1 + prodPart/2 (死亡)
```

## 本地开发

```bash
# 终端1：启动排行榜后端
npm run server:dev
# 输出: Listening on http://0.0.0.0:3001

# 终端2：启动前端 (Vite 会代理 /api 到后端)
npm run dev
# 或设置 VITE_API_URL 后直接 dev
VITE_API_URL=http://localhost:3001 npm run dev
```

前端访问 `http://localhost:5173`，排行榜自动显示 LIVE。

## 生产部署

### Node 后端

```bash
cd server/node
npm install --production
PORT=3001 NODE_ENV=production node src/index.mjs
```

### Go 后端 (预留)

```bash
cd server/go
go mod init ark-era/server/go
go get
go run cmd/server/main.go
```

### Docker (示例)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/node/package.json .
RUN npm install --production
COPY server/node/src ./src
COPY server/data ./server/data
COPY server/luban ./server/luban
EXPOSE 3001
CMD ["node", "src/index.mjs"]
```

## 测试

```bash
# 健康检查
curl http://localhost:3001/health

# 获取 Top
curl http://localhost:3001/api/v1/league/top?limit=10

# 提交 (需先登录获取 token)
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"account":"test","password":"1234"}' | jq -r .token)
curl -X POST http://localhost:3001/api/v1/league/submit -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"uid":"Uxxx","run_score":12345,"escaped":true,"run_id":1}'

# 统计
curl http://localhost:3001/api/v1/league/stats
```

## 后续优化

- [ ] 接入真实 MongoDB (替换 MemoryStore)
- [ ] 实现赛季系统 (定期重置 + 奖励)
- [ ] WebSocket 实时推送 (S2C_LeaguePush 30s)
- [ ] 排行榜分页与搜索
- [ ] 玩家详情页 (历史战绩、路线偏好)
- [ ] 公会排行榜
- [ ] 反作弊增强 (行为分析)
