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
- **挂机要素**:250ms 结算帧、8s 云存档、离线收益(50%,上限 8h)、随机事件、补给舱、模拟排行榜

## 本地运行

```bash
npm install
npm run dev      # 开发
npm run build    # 构建(输出单文件 dist/index.html)
npm run preview  # 预览构建产物
```

## 账号体系

账号+密码一键登录,**不存在即自动注册**,一个账号绑定一个 UID。
当前版本由前端内置 `src/services/mockServer.ts` 模拟后端(接口与正式协议一致),
存档每 8 秒自动同步,支持离线结算与死亡结算。

## 目录结构

```
src/
├── game/
│   ├── config.ts    # 全部游戏配置表(与 Luban 表结构对齐,可被生成物直接替换)
│   ├── engine.ts    # 纯函数引擎:产出/成本/离线/轮回奖励(服务端同公式)
│   ├── store.ts     # Zustand 中枢:tick/购买/研究/路线/发射/事件/自动存档
│   ├── fmt.ts       # 中文大数格式化(万/亿/京…)
│   └── sound.ts     # WebAudio 合成音效
├── services/
│   └── mockServer.ts  # 模拟后端(登录即注册/存档读写/会话),对应 dueGame 协议
├── components/        # 认证 / HUD / 六个玩法页 / 过场动画 / 画布(星空/地球)
docs/ARCHITECTURE.md   # 后端蓝图:dueGame + Go + MongoDB、协议、反作弊、PvE 路线图
server/luban/          # Luban 配置表样例(tb_global / tb_building)
```

## 后端(dueGame · Go · MongoDB)

设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- **集群**:Gate 节点(接入/限流/JWT)+ 逻辑 Actor(Player/League/Battle)
- **MongoDB**:`players` / `saves` / `league_run` 集合,整档 JSON + 版本号迁移
- **协议**:v0.1 HTTP 存档云同步 → v0.2 WebSocket 长连接(服务端时间权威)
- **配置**:Luban 一键导出 Go(权威)与 TypeScript(表现)双端代码

## 路线图

- v0.1 单机闭环 + HTTP 云存档(当前)
- v0.2 WS 长连接 · 真排行榜 · 赛季
- v0.3 联机 PvE:方舟小队讨伐「流浪黑洞」
- v0.4 舰队公会 · 路线赛季 · 交易行
