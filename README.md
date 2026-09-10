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
npm run gen:luban   # 生成 Luban 配置 (首次克隆后必须)
npm run dev         # 开发
npm run build       # 构建(输出单文件 dist/index.html)
npm run preview     # 预览构建产物

# 配置校验
npm run validate:config
```

## Luban 配置系统

本项目已实现完整的 Luban 配置驱动体系，**所有游戏数值均来自 CSV 配置表，拒绝硬编码**：

- **配置表**: `server/luban/tables/*.csv` (12张功能表)
- **枚举表**: `server/luban/enums/*.csv` (6个枚举)
- **Bean表**: `server/luban/beans/*.csv` (12个Bean)
- **全局配置**: `server/luban/luban.conf` (总控)
- **定义文件**: `server/luban/Defines/*.xml` (枚举/Bean/表定义)
- **生成产物**: `src/game/generated/` (TS代码 + JSON)
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

## 账号体系

账号+密码一键登录,**不存在即自动注册**,一个账号绑定一个 UID。
当前版本由前端内置 `src/services/mockServer.ts` 模拟后端(接口与正式协议一致),
存档每 8 秒自动同步,支持离线结算与死亡结算。

## 目录结构

```
src/
├── game/
│   ├── config.ts              # 配置入口：导入生成表 + 校验 + 回退 (Luban驱动)
│   ├── configValidator.ts     # 配置校验层：范围检查、枚举合法性、重复ID
│   ├── configLoader.ts        # 配置加载器：支持远程热更与缓存
│   ├── generated/             # Luban 生成产物 (不要手动编辑)
│   │   ├── Enums.ts           # 枚举定义
│   │   ├── Beans.ts           # Bean 接口
│   │   ├── Tables.ts          # 表数据常量
│   │   └── data/tables.json   # JSON 数据
│   ├── engine.ts              # 纯函数引擎:产出/成本/离线/轮回奖励(服务端同公式,数值来自GLOBAL)
│   ├── store.ts               # Zustand 中枢:tick/购买/研究/路线/发射/事件/自动存档
│   ├── fmt.ts                 # 中文大数格式化(万/亿/京…)
│   └── sound.ts               # WebAudio 合成音效
├── services/
│   └── mockServer.ts          # 模拟后端(登录即注册/存档读写/会话),对应 dueGame 协议
├── components/                # 认证 / HUD / 六个玩法页 / 过场动画 / 画布(星空/地球)
scripts/
├── luban-gen.mjs              # Luban 生成器：解析CSV → 生成TS/Go/JSON
└── validate-config.mjs        # 配置校验脚本：检查重复ID、范围、缺失文件
docs/
├── ARCHITECTURE.md            # 后端蓝图 + Luban 配置体系
└── LUBAN_CONFIG.md            # Luban 完整文档
server/luban/                  # Luban 配置中心
├── luban.conf                 # 全局配置：表清单、生成目标、校验规则
├── Defines/                   # XML 定义：__enums__.xml, __beans__.xml, __tables__.xml
├── enums/                     # 枚举表 (6个)
├── beans/                     # Bean表 (12个)
└── tables/                    # 数据表 (12张功能表 + 名字库)
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
