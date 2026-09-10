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
npm install && npm run build          # 产出 dist/
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

## 后端(dueGame 风格 · Go · MongoDB)v0.1 已实现

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

## 账号体系

账号+密码一键登录,**不存在即自动注册**,一个账号绑定一个 UID。
前端默认连接正式后端;`VITE_USE_MOCK=1` 可切回内置 `src/services/mockServer.ts` 离线演示。
存档每 8 秒自动同步,支持离线结算与死亡结算。

## 目录结构

```
src/                        # 前端(React19 + Vite + Tailwind4 + Zustand)
├── game/
│   ├── config.ts    # 全部游戏配置表(与 Luban 表结构对齐)
│   ├── engine.ts    # 纯函数引擎:产出/成本/离线/轮回奖励(与服务端同公式)
│   ├── store.ts     # Zustand 中枢:tick/购买/研究/路线/发射/事件/自动存档
│   ├── fmt.ts / sound.ts
├── services/
│   ├── serverClient.ts  # 正式后端 HTTP 客户端(默认)
│   └── mockServer.ts    # 模拟后端(VITE_USE_MOCK=1 时启用)
├── components/          # 认证 / HUD / 六个玩法页 / 过场动画 / 画布
server/                   # 后端(dueGame 风格)
├── cmd/server/main.go    # 入口:单进程网关
├── internal/
│   ├── gate/             # HTTP 接入:路由/JWT/限流/CORS/静态托管
│   ├── module/           # 账号:登录即注册 + bcrypt + JWT
│   ├── engine/           # 服务端权威公式 + 反作弊校验 + 双端一致性测试
│   └── store/            # filestore(默认)/ mongostore(生产)
├── luban/                # Luban 配置表样例(tb_global / tb_building)
scripts/gen-fixture.mjs   # TS↔Go 数值一致性 fixture 生成器
docs/ARCHITECTURE.md      # 总体架构(协议/反作弊/PvE 路线图)
docs/HANDOFF.md           # 任务交接/复现说明
```

## 配置(Luban)

`src/game/config.ts` 为客户端表的手写等价版,字段命名与 bean 一致;
表样例见 `server/luban/*.csv`(tb_global / tb_building)。
接入 Luban 后由生成物直接替换双端配置,引擎层零改动。

## 路线图

- v0.1 ✅ 单机闭环 + HTTP 云存档 + 真实排行榜 + 服务端反作弊(当前)
- v0.2 WS 长连接(due transport)· 服务端离线结算 · 赛季
- v0.3 联机 PvE:方舟小队讨伐「流浪黑洞」
- v0.4 舰队公会 · 路线赛季 · 交易行
