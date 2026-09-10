# 方舟纪元 ARK ERA

> 地球解体倒计时下的科技挂机(Idle/Incremental)网页游戏。
> 攀过六个科技纪元,选择文明的飞升形态,在母星化为星尘之前点火逃离。

![stack](https://img.shields.io/badge/frontend-React19%20%2B%20Vite%20%2B%20Tailwind4-22d3ee)
![stack](https://img.shields.io/badge/backend-dueGame%20%2B%20Go%20%2B%20MongoDB-f59e0b)
![stack](https://img.shields.io/badge/config-Luban-a78bfa)

## 玩法

- **地球倒计时**:每轮回地球实时走向解体,一切建设都是与时间的赛跑
- **三条产业链**:能量(点击+电站)/ 物资 / 科研,互相咬合,建筑 25 座里程碑翻倍
- **18 项科技 · 6 个纪元**:危机 → 重整 → 环轨 → 飞升前夜 → 深空 → 终章「曲率引擎」
- **三大飞升路线**:机械飞升(算力)· 蜂群意志(生物质)· 灵能升华(灵能),可切换
- **轮回系统**:点火逃离或随地球毁灭,结算**星核**,永恒遗产跨轮回永久生效
- **文明编年史 · 墓碑 · 快照**:每次轮回自动落笔 —— 毁灭留下铭文**墓碑**,逃逸立起**方舟纪念碑**;快照页一览文明现状与生涯统计,随云存档同步
- **挂机要素**:250ms 结算帧、8s 云存档、离线收益(50%,上限 8h)、随机事件、补给舱、**真实产能榜**

## 一键启动(单进程:静态前端 + 游戏后端)

```bash
# 0) 前置:Go 1.27+ 与 Node 20+
# 1) 构建前端单文件 + 编译后端
npm install
npm run gen:luban              # 生成 Luban 配置 (首次克隆后必须)
npm run build                  # 产出 dist/
cd server && go mod tidy && go build -o bin/ctwork-server ./cmd/server && cd ..

# 2) 启动(web + API 同端口,默认 :8090)
./server/bin/ctwork-server            # 文件存储(开发默认)
# 或接 MongoDB:
ARK_MONGO_URI=mongodb://localhost:27017/ark_era ./server/bin/ctwork-server

# 3) 打开 http://localhost:8090 → 输入账号密码(不存在自动注册)
```

开发模式(前端热更 + 代理):

```bash
./server/bin/ctwork-server &   # 后端 :8090
npm run dev                    # vite :5173,/api 自动代理到 :8090
```

Docker 一键起 MongoDB + 服务端:`docker compose up -d --build` → http://localhost:8090

### 排行榜后端 (Node 备用 / 完整版)

```bash
# 启动 Node 排行榜后端 (兼容 dueGame 协议)
npm run server:dev
# 健康检查 http://localhost:3001/health
# 排行榜 http://localhost:3001/api/v1/league/top

# 前端接入真实后端 (二选一)
VITE_API_BASE=http://localhost:8090 npm run dev   # Go 后端
VITE_API_URL=http://localhost:3001 npm run dev    # Node 排行榜后端
```

## Luban 配置系统

本项目已实现完整的 Luban 配置驱动体系，**所有游戏数值均来自 CSV 配置表，拒绝硬编码**：

- **配置表**: `server/luban/tables/*.csv` (12张功能表)
- **枚举表**: `server/luban/enums/*.csv` (6个枚举)
- **Bean表**: `server/luban/beans/*.csv` (12个Bean)
- **全局配置**: `server/luban/luban.conf` (总控)
- **定义文件**: `server/luban/Defines/*.xml` (枚举/Bean/表定义)
- **生成产物**: `src/game/generated/` (TS代码 + JSON) + `server/internal/config/gen/`
- **生成器**: `scripts/luban-gen.mjs` (模拟 Luban 官方工具链)
- **校验器**: `src/game/configValidator.ts` + `scripts/validate-config.mjs`

策划改表流程：

```bash
# 1. 编辑 CSV，例如 server/luban/tables/tb_building.csv
# 2. 生成
npm run gen:luban
# 3. 校验
npm run validate:config
# 4. 前后端自动生效
```

详见：

- `server/luban/README.md` - 快速开始
- `docs/LUBAN_CONFIG.md` - 完整文档
- `docs/ARCHITECTURE.md` §3 - 架构中的配置方案

### 健壮性设计

- **三层校验**: CSV解析 → 业务校验 → 运行时回退
- **默认值回退**: 配置缺失时使用内嵌默认值，游戏不崩溃
- **范围钳制**: 非法值自动修正并警告
- **重复ID检测**: 生成与校验时均检查
- **热更支持**: `configLoader.ts` 支持远程 JSON 加载

## 账号体系与排行榜后端

账号+密码一键登录,**不存在即自动注册**,一个账号绑定一个 UID。

### 双模式后端

- **Mock 模式** (`VITE_USE_MOCK=1` 或 `VITE_API_URL` 为空): 使用 `mockServer.ts` (localStorage) 模拟所有接口，排行榜为本地模拟
- **Real 模式** (默认): 接入真实后端
  - Go 后端 `:8090` (文件存储或 MongoDB)
  - Node 排行榜后端 `:3001` (MemoryStore + 文件持久化)

### 排行榜特性

- **协议**: 兼容 dueGame，`POST /api/v1/auth/login`, `GET/POST /api/v1/player/save`, `GET /api/v1/league/top`, `POST /api/v1/league/submit`, `GET /api/v1/league/stats`
- **存储**: MemoryStore + 文件持久化 (30s 自动保存)，可无缝替换为 MongoDB (`players` / `saves` / `league_run`)
- **反作弊**: 资源增量上限、分数上限 1e12、限流、版本校验、bcrypt + JWT
- **配置驱动**: 分数公式来自 `tb_global.csv` (rewardProdDivisor, rewardTimeDivisor)
- **双端实现**: Go (权威) + Node (备用，可运行)

详见 `docs/LEADERBOARD.md`。

存档每 8 秒自动同步,支持离线结算与死亡结算，轮回结束自动提交排行榜。

## 后端(dueGame 风格 · Go · MongoDB) v0.1 已实现

结构对齐 dueGame(gate 接入层 + module 逻辑模块 + engine 权威引擎 + store 仓储):

| 接口 | 说明 |
|---|---|
| `POST /api/v1/auth/login` | 登录即注册,`{account,password}` → `{token,uid,account,isNew,serverTime}` |
| `GET  /api/v1/player/profile` | Bearer JWT → 账号信息 |
| `GET  /api/v1/player/save` | 拉取整档 JSON |
| `POST /api/v1/player/save` | 8s 节流推送,**服务端权威反作弊校验**后入库 |
| `DELETE /api/v1/player/save` | 清空存档(重新开局) |
| `GET  /api/v1/league/top?n=` | 真实产能榜 TopN + 我的名次 |
| `GET  /healthz` | 健康检查 |

**反作弊(docs/ARCHITECTURE.md §2.4)**:

1. 资源增量上限:`Δres ≤ 理论产出 × Δt × 1.2`,长窗口按离线口径(50%/8h 封顶),Δt 用**服务端时钟**
2. 购买审计:建筑/科技/升级按配置表重算累计成本,支付不起一律回退
3. 科技前置链校验;等级上限钳制;倒计时单调性(只允许加时);星核/轮回增量钳制
4. bcrypt(成本 10)存口令 + JWT(HS256,30 天)+ 登录 IP 限流(30 次/分钟)
5. 作弊策略:钳制/回退 + 告警日志返回 `warnings`,不硬拒收,避免误伤

**双端一致性**:服务端 `server/internal/engine` 与前端 `src/game/engine.ts` 是同一套公式的两个实现,
由 `scripts/gen-fixture.mjs`(Node 真实执行 TS 引擎)生成 fixture,`go test` 逐字段比对
(派生属性/离线收益/星核结算/成本公式),浮点级一致。

**存储**:默认本地 JSON 文件(`ARK_DATA_DIR`,开发零依赖);设 `ARK_MONGO_URI` 切 MongoDB
(`players` / `saves` / `league_run` 三集合,整档 JSON + 服务端接收时间戳)。

## 目录结构

```
src/                        # 前端(React19 + Vite + Tailwind4 + Zustand)
├── game/
│   ├── config.ts              # 配置入口：导入生成表 + 校验 + 回退 (Luban驱动)
│   ├── configValidator.ts     # 配置校验层
│   ├── configLoader.ts        # 配置加载器：热更
│   ├── leagueStore.ts         # 排行榜状态
│   ├── generated/             # Luban 生成产物
│   │   ├── Enums.ts / Beans.ts / Tables.ts / data/tables.json
│   ├── engine.ts              # 纯函数引擎 (与服务端同公式,数值来自GLOBAL)
│   ├── store.ts               # Zustand 中枢 + 排行榜提交
│   ├── fmt.ts / sound.ts
├── services/
│   ├── api.ts                 # 统一API客户端：自动切换 Mock/Real
│   ├── serverClient.ts        # 正式后端 HTTP 客户端(默认)
│   ├── mockServer.ts          # 模拟后端(VITE_USE_MOCK=1)
│   └── leaderboardService.ts  # 排行榜业务层
├── components/game/
│   ├── SidePanel.tsx          # 侧边栏：倒计时 + 地球 + 日志 + 迷你榜 (LIVE/MOCK)
│   ├── LeaderboardTab.tsx     # 完整排行榜页
│   ├── ChronicleTab.tsx       # 文明编年史/墓碑
│   └── ...
server/                     # 后端
├── cmd/server/main.go        # 入口:单进程网关
├── internal/
│   ├── gate/                 # HTTP 接入:路由/JWT/限流/CORS/静态托管
│   ├── module/               # 账号:登录即注册 + bcrypt + JWT + 排行榜
│   ├── engine/               # 服务端权威公式 + 反作弊校验 + 双端一致性测试
│   └── store/                # filestore(默认)/ mongostore(生产)
├── luban/                    # Luban 配置中心 (conf + Defines + enums + beans + tables)
├── node/                     # Node 排行榜后端 (备用)
│   ├── src/index.mjs
│   └── src/routes/ + services/ + storage/
└── go/ (旧路径预留)          # Go 排行榜备用
scripts/
├── luban-gen.mjs             # Luban 生成器
├── validate-config.mjs       # 配置校验
└── gen-fixture.mjs           # TS↔Go 数值一致性 fixture 生成器
docs/
├── ARCHITECTURE.md
├── LUBAN_CONFIG.md
├── LEADERBOARD.md
└── HANDOFF.md
```

## 配置(Luban)

`src/game/config.ts` 为 Luban 生成表的封装，字段命名与 bean 一致;
表样例见 `server/luban/tables/*.csv`，由 `npm run gen:luban` 生成双端代码。

## 路线图

- v0.1 ✅ 单机闭环 + HTTP 云存档 + 真实排行榜 + 服务端反作弊 + Luban 配置驱动 (当前)
- v0.2 WS 长连接(due transport)· 服务端离线结算 · 赛季
- v0.3 联机 PvE:方舟小队讨伐「流浪黑洞」
- v0.4 舰队公会 · 路线赛季 · 交易行
