# Luban 配置系统 - 方舟纪元 ARK ERA

> 所有游戏数值均通过 Luban CSV 配置表驱动，拒绝硬编码。策划改表 → 一键生成 → 双端生效。

## 目录结构

```
server/luban/
├── luban.conf                 # 全局配置：定义所有表、生成目标、校验规则
├── Defines/                   # Luban 定义文件 (XML)
│   ├── __enums__.xml          # 枚举定义：ResourceType, RouteId, EffectKind...
│   ├── __beans__.xml          # Bean定义：Cost, Effect, Building...
│   └── __tables__.xml         # 表定义：tb_global, tb_building...
├── enums/                     # 枚举表 (CSV, ##type=enum)
│   ├── enum_resource_type.csv
│   ├── enum_chain_type.csv
│   ├── enum_route_id.csv
│   ├── enum_effect_kind.csv
│   ├── enum_event_kind.csv
│   └── enum_event_tone.csv
├── beans/                     # Bean表 (CSV, ##type=bean)
│   ├── bean_cost.csv
│   ├── bean_effect.csv
│   ├── bean_building.csv
│   ├── bean_click_upgrade.csv
│   ├── bean_era.csv
│   ├── bean_research.csv
│   ├── bean_route.csv
│   ├── bean_route_upgrade.csv
│   ├── bean_core_upgrade.csv
│   ├── bean_story.csv
│   ├── bean_random_event.csv
│   └── bean_res_meta.csv
├── tables/                    # 数据表 (CSV, ##type=table)
│   ├── tb_global.csv          # 全局常量 (KV)
│   ├── tb_building.csv        # 建筑 (16种)
│   ├── tb_click_upgrade.csv   # 点击升级 (3种)
│   ├── tb_era.csv             # 纪元 (6纪元)
│   ├── tb_research.csv        # 科技树 (16项)
│   ├── tb_route.csv           # 飞升路线 (3路线)
│   ├── tb_route_upgrade.csv   # 路线升级 (12项)
│   ├── tb_core_upgrade.csv    # 星核遗产 (5项)
│   ├── tb_story.csv           # 倒计时剧情 (7条)
│   ├── tb_random_event.csv    # 随机事件 (6种)
│   ├── tb_res_meta.csv        # 资源元信息
│   └── tb_leaderboard_name.csv # 排行榜名字库
└── README.md                  # 本文件

src/game/generated/            # 生成产物 (不要手动编辑)
├── Enums.ts                   # 枚举 TS 代码
├── Beans.ts                   # Bean TS 接口
├── Tables.ts                  # 表数据 TS 常量
├── index.ts                   # 入口
└── data/
    └── tables.json            # JSON 数据 (供 Go 服务端与热更)
```

## Luban CSV 格式规范

### 通用头部

```csv
##type = table|bean|enum
##file = BuildingTable
##group = c,s
##brief = 建筑配置表
##mode = map|list
##key = id
#id,name,desc,...
b_solar,太阳能阵列,...
```

- `##type`: 表类型
  - `table`: 数据表
  - `bean`: 结构体定义
  - `enum`: 枚举定义
- `##file`: 生成文件名 (对应 Luban 导出)
- `##group`: 目标分组
  - `c`: client only
  - `s`: server only
  - `c,s`: both
- `##mode`: 数据模式
  - `map`: 以 `##key` 为索引的 Map
  - `list`: 数组
- `#...`: 列头，逗号分隔

### Enum 表示例

```csv
##type = enum
##file = ResourceType
##group = c,s
##brief = 资源类型枚举
#name,value,comment
energy,0,能量
material,1,物资
```

### Bean 表示例

```csv
##type = bean
##file = Cost
##group = c,s
##brief = 资源消耗结构
#name,type,comment,required
energy,int?,能量消耗,0
material,int?,物资消耗,0
```

### Data 表示例

```csv
##type = table
##file = BuildingTable
##group = c,s
##brief = 建筑配置表
##mode = map
##key = id
#id,name,en,chain,base_energy,scale,produces,per_sec,unlock_research
b_solar,太阳能阵列,SOLAR ARRAY,energy,15,1.15,energy,0.5,
```

## 全局配置表 luban.conf

`luban.conf` 是 Luban 的全局配置，定义了：

- **targets**: 生成目标 (typescript, go, json)
- **pipeline**: 输入输出路径
- **tables**: 所有数据表清单
- **beans**: 所有 Bean 清单
- **enums**: 所有枚举清单
- **validation**: 校验规则

示例：

```json
{
  "version": "1.0.0",
  "tables": [
    { "name": "tb_global", "file": "tb_global.csv", "group": "c,s", "type": "table", "mode": "map", "key": "key" }
  ],
  "validation": {
    "strict": true,
    "checkDuplicateId": true,
    "rules": ["tb_building.scale must be >=1.0 and <=2.0"]
  }
}
```

## 生成流程

### 1. 策划改表

直接编辑 `server/luban/tables/*.csv`，例如调整建筑产出：

```csv
b_solar,太阳能阵列,SOLAR ARRAY,危机纪元最可靠的第一缕光。,energy,15,,, ,1.15,energy,0.8,,
```

### 2. 一键生成

```bash
npm run gen:luban
# 或
node scripts/luban-gen.mjs
```

生成器会：

- 解析所有 CSV
- 校验数据 (重复ID、范围、枚举值、外键)
- 生成 `src/game/generated/Tables.ts` (TS 常量)
- 生成 `src/game/generated/Beans.ts` (TS 接口)
- 生成 `src/game/generated/Enums.ts` (枚举)
- 生成 `src/game/generated/data/tables.json` (JSON, 供 Go 服务端)
- 生成 `server/internal/config/gen/tables_gen.go` (Go 代码)

### 3. 前端自动生效

`src/game/config.ts` 会自动导入生成表，并进行二次校验与回退：

```ts
import { GLOBAL, BUILDINGS } from "./generated/Tables";
import { validateAll } from "./configValidator";

// 若生成表缺失或校验失败，自动回退到内嵌默认值，保证游戏可运行
```

### 4. 后端同步

Go 服务端读取 `server/data/tables.json` 或 `server/internal/config/gen/tables_gen.go`，与前端同源，杜绝数值不一致。

## 健壮性设计

### 多层校验

1. **CSV 解析层** (`luban-gen.mjs`):
   - 检查表头是否存在
   - 检查列数是否匹配
   - 检查必填字段

2. **业务校验层** (`configValidator.ts`):
   - `validateGlobal`: 范围检查、钳制
   - `validateBuildings`: 重复ID、scale范围、perSec>0、枚举合法性
   - `validateResearch`: era范围、依赖存在性
   - `validateRoutes`: RouteId 合法性
   - 等等

3. **运行时回退层** (`config.ts`):
   - `safeGet(genValue, fallback)`: 若生成值缺失，使用 fallback
   - `FALLBACK_*`: 内嵌默认值，保证游戏不崩溃
   - `getConfigHealth()`: 返回健康状态，供 UI 展示

### 示例：全局表校验

```ts
if (data.earthCountdownSeconds < 60 || data.earthCountdownSeconds > 86400) {
  warnings.push(`earthCountdownSeconds ${data.earthCountdownSeconds} out of [60,86400], clamped`);
  data.earthCountdownSeconds = Math.min(86400, Math.max(60, data.earthCountdownSeconds));
}
```

### 配置热更

`src/game/configLoader.ts` 支持远程加载：

```ts
import { loadConfig } from "./configLoader";
const result = await loadConfig({ url: "/config/tables.json", useCache: true });
```

## 各功能表说明

| 表 | 功能 | 关键字段 | 示例 |
|---|---|---|---|
| `tb_global` | 全局常量 | key/value | earth_countdown_seconds=3600 |
| `tb_building` | 建筑 (16种) | id/chain/scale/per_sec | b_solar, energy, 1.15, 0.5 |
| `tb_click_upgrade` | 点击升级 | effect_k/effect_v | u_click, clickMult, 2 |
| `tb_era` | 纪元 (6) | id/name/flavor | 0, 危机纪元, ... |
| `tb_research` | 科技树 (16) | era/cost/req/effects | r_command, 0, research:6, mult:all:1.2 |
| `tb_route` | 飞升路线 (3) | specialName/requireResearch | machine, 算力, r_ai |
| `tb_route_upgrade` | 路线升级 (12) | route/effect_k/effect_v | ru_m_furnace, machine, mult:energy:1.35 |
| `tb_core_upgrade` | 星核遗产 (5) | base/inc/effect | cu_ember, 6, 4, mult:energy:1.3 |
| `tb_story` | 倒计时剧情 (7) | remainSec/tone | st_start, 3599, info |
| `tb_random_event` | 随机事件 (6) | kind/res/seconds | ev_solar, instant, energy, 90 |
| `tb_res_meta` | 资源元信息 | color | energy, #22d3ee |
| `tb_leaderboard_name` | 名字库 | name | 文明观察者#4211 |

## Bean 表说明

| Bean | 用途 | 字段 |
|---|---|---|
| `Cost` | 资源消耗 | energy?, material?, research?, special? |
| `Effect` | 效果定义 | k, res?, v?, route?, text? |
| `Building` | 建筑 | id, name, chain, baseCost, scale, produces, perSec |
| `ClickUpgrade` | 点击升级 | baseCost, scale, max, effect |
| `Era` | 纪元 | id, name, en, flavor |
| `Research` | 科技 | era, cost, req[], effects[] |
| `Route` | 路线 | specialName, requireResearch, perks[] |
| `RouteUpgrade` | 路线升级 | route, baseCost, scale, effect |
| `CoreUpgrade` | 星核遗产 | base, inc, effectPer |
| `StoryEvent` | 剧情 | remainSec, tone, text |
| `RandomEvent` | 随机事件 | kind, res?, seconds?, deadlineAdd? |
| `ResMeta` | 资源元信息 | name, en, color |

## Enum 表说明

| Enum | 值 | 说明 |
|---|---|---|
| `ResourceType` | energy, material, research, special, all | 资源类型 |
| `ChainType` | energy, material, research, special | 产业链 |
| `RouteId` | machine, swarm, psionic | 飞升路线 |
| `EffectKind` | mult, clickMult, autoClick, crit, countdown, enableRoute, startKit, note, final | 效果类型 |
| `EventKind` | instant, crate, deadline | 事件种类 |
| `EventTone` | info, success, warn, danger, story | 事件语气 |

## CI/CD 集成

```bash
# 校验所有表
npm run validate:config

# 生成并构建
npm run gen:luban && npm run build
```

在 CI 中应：

1. 运行 `validate:config` 确保无重复ID、范围错误
2. 运行 `gen:luban` 生成最新代码
3. 检查 `git diff src/game/generated/` 是否有未提交的变更，若有则报错提示策划未提交生成产物

## 常见问题

**Q: 改了 CSV 但游戏没变化？**

A: 需运行 `npm run gen:luban` 重新生成 TS 代码，然后刷新浏览器。

**Q: 生成失败提示 duplicate id？**

A: 检查 CSV 中是否有重复的 id 行，`validate:config` 会指出具体文件与行号。

**Q: 如何新增一张表？**

1. 在 `server/luban/tables/` 新建 `tb_xxx.csv`，按 Luban 格式写头部与数据
2. 在 `luban.conf` 的 `tables` 数组中注册
3. 在 `Defines/__tables__.xml` 中添加 `<table>` 定义
4. 在 `scripts/luban-gen.mjs` 中添加解析函数 `genXxx()`
5. 运行 `npm run gen:luban`

**Q: 后端 Go 如何使用配置？**

Go 代码已生成在 `server/internal/config/gen/tables_gen.go`，或直接读取 `server/data/tables.json`：

```go
import "ark-era/server/internal/config/gen"
fmt.Println(gen.Global["earth_countdown_seconds"])
```

## 参考

- Luban 官方: https://github.com/focus-creative-games/luban
- 本项目 `docs/ARCHITECTURE.md` §3 配置方案
- 生成器实现: `scripts/luban-gen.mjs`
- 校验器实现: `src/game/configValidator.ts`
