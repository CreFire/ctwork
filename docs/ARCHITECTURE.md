# 方舟纪元 ARK ERA — 总体架构设计

> 科技挂机 · 地球倒计时 · 多路线飞升 · 轮回系统
> 前端 React(本仓库)/ 后端 dueGame + Go + MongoDB / 配置 Luban

---

## 1. 系统拓扑

```
┌──────────────────────────────────────────────────────────┐
│                        客户端(Web)                        │
│  React19 + Vite + Tailwind + Zustand + Framer Motion     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ 表现层(UI)   │←→│ 游戏引擎(纯函│←→│ 配置表(Luban 导出)│ │
│  └──────────────┘  └──────────────┘  └─────────────────┘ │
│           ↓ HTTP(v1) / WebSocket(v2 实时化)                │
└──────────────────────────────────────────────────────────┘
                 │                │
        ┌────────┴──────┐  ┌──────┴─────────┐
        │  Gate 网关节点  │  │  逻辑 Actor 集群 │    dueGame 微服务
        │ (接入/限流/鉴权)│→→│ (Player/Guild/  │
        └───────────────┘  │  League/Battle) │
                           └──────┬──────────┘
                                  │
                        ┌─────────┴─────────┐
                        │     MongoDB        │
                        │ players/saves/...  │
                        └───────────────────┘
```

- 前端内置 `src/services/mockServer.ts` **完整模拟后端五个接口**,字段与正式协议一致,
  切换正式服只需把该文件实现替换为真实 fetch/WebSocket。
- 生产公式(产出/成本/奖励)以**服务端为准**,客户端为表现与预测层,防止作弊。

## 2. 后端:dueGame + Go + MongoDB

### 2.1 模块划分(dueGame 推荐结构)

```
server/
├── cmd/server/main.go        # 集群启动:Node(gate) + Node(game)
├── internal/
│   ├── gate/                 # HTTP/WS 接入、限流、JWT 签发与校验
│   ├── module/
│   │   ├── account/          # AccountActor:登录即注册、uid 绑定
│   │   ├── player/           # PlayerActor:存档读写、tick 校验、心跳
│   │   ├── league/           # 排行榜 Actor(周期重排,Mongo 落榜)
│   │   └── battle/           # (v0.3)PvE 房间:流浪黑洞/虫潮母体
│   ├── engine/               # 与前端同公式的产出/奖励计算(唯一权威)
│   ├── store/mongo/          # 仓储层:drivers + 索引初始化
│   └── proto/                # pb 消息与路由注册
├── config/luban/             # Luban 导出的 Go bean 代码
└── gen/                      # luban/protoc 产物
```

### 2.2 MongoDB 集合设计

| 集合           | 关键字段                                                        | 索引                          |
|----------------|----------------------------------------------------------------|-------------------------------|
| `players`      | `_id`(uid), `account`(唯一), `pass_hash`(bcrypt), `created_at` | unique(account)               |
| `saves`        | `uid`, `payload`(整档 JSON/BSON), `version`, `updated_at`       | unique(uid)                   |
| `league_run`   | `uid`, `run_score`(纪元产能), `escaped`, `run_id`, `ts`         | (run_score desc)              |
| `events_meta`  | 全服事件/赛季开关                                                | -                             |

存档采用**整档 JSON + 版本号**:`version` 对应 Luban/公式版本,迁移在加载时逐级执行。

### 2.3 协议(与前端 mockServer 一一对应)

#### v0.1(当前):HTTP 短连接 — 挂机类足够
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login`     | `{account,password}` → 不存在自动注册,返回 `{token,uid,is_new}` |
| GET  | `/api/v1/player/profile` | Bearer token → 账号信息 |
| GET  | `/api/v1/player/save`    | 拉取存档(进入游戏时一次) |
| POST | `/api/v1/player/save`    | 节流推送(客户端 8s 一跳;服务端校验资源增量上限) |
| GET  | `/api/v1/league/top`     | 产能榜 TopN + 我的名次 |

#### v0.2 起:WebSocket(dueGame 长连接)
```
1001 C2S_Login          → S2C_LoginAck {uid, server_time}
1003 C2S_SaveSync       → S2C_SaveSyncAck
1101 S2C_OfflineSettle  (离线结算:由服务端在连接建立时下发)
1201 S2C_LeaguePush     (榜单变化广播,30s)
1301 C2S_BattleMatch    → S2C_BattleStart(PvE,预留)
```
服务端持有 `server_time`,**倒计时以服务端时间为准**,客户端只做插值显示。

### 2.4 反作弊要点(挂机类必做)
1. 资源增量上限:每次 save 校验 `Δres ≤ 理论最大产出 × Δt × 1.2`。
2. 购买校验:成本由服务端按 Luban 表重算,不信任客户端提交的购买数。
3. 离线结算在服务端执行(`applyOffline` 同公式),防止改本地时间。
4. `pass_hash` 使用 bcrypt(成本 10),登录接口 IP 限速 + 失败冷却。

## 3. 配置:Luban 方案 (已完整实现)

### 3.1 总览

- 所有游戏数值均来自 `server/luban/tables/*.csv`，由 `scripts/luban-gen.mjs` 生成双端代码，**彻底消除硬编码**。
- 前端 `src/game/config.ts` 从 `src/game/generated/Tables.ts` 导入生成表，并通过 `configValidator.ts` 进行运行时校验与回退，保证健壮性。
- 后端 Go 读取 `server/data/tables.json` 或 `server/internal/config/gen/tables_gen.go`，与前端同源。

```
CSV (策划) → luban-gen.mjs → Tables.ts + Beans.ts + Enums.ts + tables.json + tables_gen.go
                                      ↓
                              config.ts (校验+回退) → engine.ts / store.ts (零改动)
```

### 3.2 目录结构

```
server/luban/
├── luban.conf                 # 全局配置：表清单、生成目标、校验规则
├── Defines/
│   ├── __enums__.xml          # 枚举定义
│   ├── __beans__.xml          # Bean 定义
│   └── __tables__.xml         # 表定义
├── enums/                     # 枚举表 (CSV, ##type=enum)
│   ├── enum_resource_type.csv
│   ├── enum_route_id.csv
│   ├── enum_effect_kind.csv
│   └── ...
├── beans/                     # Bean 表 (CSV, ##type=bean)
│   ├── bean_cost.csv
│   ├── bean_effect.csv
│   └── ...
├── tables/                    # 数据表 (CSV, ##type=table)
│   ├── tb_global.csv          # 全局常量 25 键
│   ├── tb_building.csv        # 建筑 16 种
│   ├── tb_click_upgrade.csv   # 点击升级 3 种
│   ├── tb_era.csv             # 纪元 6 个
│   ├── tb_research.csv        # 科技 16 项
│   ├── tb_route.csv           # 路线 3 条
│   ├── tb_route_upgrade.csv   # 路线升级 12 项
│   ├── tb_core_upgrade.csv    # 星核遗产 5 项
│   ├── tb_story.csv           # 剧情 7 条
│   ├── tb_random_event.csv    # 随机事件 6 种
│   └── ...
src/game/generated/            # 生成产物
├── Enums.ts / Beans.ts / Tables.ts
└── data/tables.json
```

### 3.3 表清单

| 表 | 用途 | 关键列 | 数量 |
|---|---|---|---|
| `tb_global` | 全局常量:倒计时、离线效率、发射需求、补给、奖励除数等 | key/value | 25 键 |
| `tb_building` | 建筑 | id/chain/base_cost/scale/per_sec/unlock | 16 |
| `tb_click_upgrade` | 点击升级 | effect_k/effect_v | 3 |
| `tb_era` | 纪元 | id/name/flavor | 6 |
| `tb_research` | 科技树 | era/cost/req/effects | 16 |
| `tb_route` | 三大路线 | id/special_name/require | 3 |
| `tb_route_upgrade` | 路线升级 | route/effect/max/scale | 12 |
| `tb_core_upgrade` | 星核遗产(跨轮回) | effect_per/max/cost | 5 |
| `tb_random_event` | 随机事件 | kind/res/seconds/weight | 6 |
| `tb_story` | 倒计时剧情 | remain_sec/tone/text | 7 |
| `tb_res_meta` | 资源元信息 | color | 4 |
| `tb_leaderboard_name` | 排行榜名字库 | name | 30 |

### 3.4 Enum 表

| Enum | 值 | 说明 |
|---|---|---|
| `ResourceType` | energy, material, research, special, all | 资源类型 |
| `ChainType` | energy, material, research, special | 产业链 |
| `RouteId` | machine, swarm, psionic | 飞升路线 |
| `EffectKind` | mult, clickMult, autoClick, crit, countdown, enableRoute, startKit, note, final | 效果类型 |
| `EventKind` | instant, crate, deadline | 事件种类 |
| `EventTone` | info, success, warn, danger, story | 事件语气 |

### 3.5 Bean 表

| Bean | 用途 | 字段 |
|---|---|---|
| `Cost` | 资源消耗 | energy?, material?, research?, special? |
| `Effect` | 效果定义 | k, res?, v?, route?, text? |
| `Building` | 建筑 | id, name, chain, baseCost, scale, produces, perSec, unlock |
| `ClickUpgrade` | 点击升级 | baseCost, scale, max, effect |
| `Research` | 科技 | era, cost, req[], effects[] |
| `Route` | 路线 | specialName, requireResearch, perks[] |
| ... | ... | ... |

详见 `docs/LUBAN_CONFIG.md` 与 `server/luban/README.md`。

### 3.6 健壮性设计

- **三层校验**: CSV 解析层 → 业务校验层 (`configValidator.ts`) → 运行时回退层 (`config.ts` safeGet + FALLBACK)
- **默认值回退**: 生成表缺失时使用内嵌默认值，游戏不崩溃
- **范围钳制**: 如 `scale` 超出 [1.0,2.0] 自动钳制并警告
- **重复ID检测**: 生成时与校验时均检查重复ID
- **热更支持**: `configLoader.ts` 支持远程 JSON 加载与缓存

策划只需改表 → `npm run gen:luban` → 双端同时生效，引擎层零改动。

## 4. 路线图

| 版本 | 内容 |
|---|---|
| v0.1(当前) | 单机手感闭环:倒计时/科技树/三路线/轮回 + HTTP 存档云同步 + 模拟榜 |
| v0.2 | WS 长连接、真实排行榜、服务端离线结算、赛季 |
| v0.3 | 联机 PvE:3-5 人方舟小队讨伐「流浪黑洞」,产能合并结算、伤害榜掉落星核涂装 |
| v0.4 | 公会(舰队)、科技路线专属赛季、交易行(物资互换) |
