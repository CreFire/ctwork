# Luban 配置系统 - 完整文档

## 概述

方舟纪元的所有游戏数值均通过 Luban 配置表驱动，彻底消除硬编码。策划只需修改 CSV 表，运行生成器，双端（前端 TS + 后端 Go）自动同步。

## 核心原则

1. **配置驱动**: 所有数值来自 CSV，不在代码中写死
2. **双端同源**: 一份 CSV 生成 TS 和 Go，保证数值一致
3. **健壮性**: 多层校验 + 默认值回退，配置错误不导致崩溃
4. **可热更**: 支持 JSON 热更与远程加载

## 全局配置表 luban.conf

位置: `server/luban/luban.conf`

这是 Luban 的总控文件，定义了所有表、生成目标、校验规则。

```json
{
  "version": "1.0.0",
  "targetLanguage": ["typescript", "go", "json"],
  "pipeline": {
    "inputDataDir": "server/luban/tables",
    "inputDefineDir": "server/luban/Defines",
    "outputCodeDir": {
      "typescript": "src/game/generated",
      "go": "server/internal/config/gen"
    }
  },
  "tables": [...],
  "beans": [...],
  "enums": [...],
  "validation": {
    "strict": true,
    "checkDuplicateId": true,
    "rules": ["tb_building.scale must be >=1.0 and <=2.0"]
  }
}
```

## Enum 表 - 枚举定义

位置: `server/luban/enums/*.csv`

每个枚举表定义一个枚举类型，用于约束配置值的合法范围。

### 文件清单

- `enum_resource_type.csv`: 资源类型 (energy, material, research, special, all)
- `enum_chain_type.csv`: 产业链 (energy, material, research, special)
- `enum_route_id.csv`: 飞升路线 (machine, swarm, psionic)
- `enum_effect_kind.csv`: 效果类型 (mult, clickMult, autoClick, crit, countdown, enableRoute, startKit, note, final)
- `enum_event_kind.csv`: 事件种类 (instant, crate, deadline)
- `enum_event_tone.csv`: 事件语气 (info, success, warn, danger, story)

### 格式

```csv
##type = enum
##file = ResourceType
##group = c,s
##brief = 资源类型枚举
#name,value,comment
energy,0,能量
material,1,物资
```

## Bean 表 - 结构体定义

位置: `server/luban/beans/*.csv`

每个 Bean 表定义一个结构体，用于描述复合数据。

### 文件清单

- `bean_cost.csv`: 资源消耗 (energy?, material?, research?, special?)
- `bean_effect.csv`: 效果 (k, res?, v?, route?, text?)
- `bean_building.csv`: 建筑 Bean
- `bean_click_upgrade.csv`: 点击升级 Bean
- `bean_era.csv`: 纪元 Bean
- `bean_research.csv`: 科技 Bean
- `bean_route.csv`: 路线 Bean
- `bean_route_upgrade.csv`: 路线升级 Bean
- `bean_core_upgrade.csv`: 星核遗产 Bean
- `bean_story.csv`: 剧情 Bean
- `bean_random_event.csv`: 随机事件 Bean
- `bean_res_meta.csv`: 资源元信息 Bean

### 格式

```csv
##type = bean
##file = Cost
##group = c,s
##brief = 资源消耗结构
#name,type,comment,required
energy,int?,能量消耗,0
material,int?,物资消耗,0
```

## 数据表 - 功能配置

位置: `server/luban/tables/*.csv`

每个数据表包含实际的游戏数值，策划主要修改这些表。

### tb_global - 全局常量表

单例 KV 表，所有全局可调数值。

```csv
##type = table
##file = GlobalTable
##group = c,s
##brief = 全局参数表
##mode = map
##key = key
#key,value,comment,type,group
earth_countdown_seconds,3600,每轮地球解体倒计时(秒),int,"c,s"
offline_cap_hours,8,离线收益上限(小时),int,"c,s"
...
```

包含 25 个键：

- `version`: 配置版本号
- `earth_countdown_seconds`: 地球倒计时
- `offline_cap_hours`: 离线上限
- `offline_efficiency`: 离线效率
- `click_base_power`: 点击基础产出
- `crit_mult`: 暴击倍率
- `milestone_every`: 里程碑步长
- `milestone_mult`: 里程碑倍率
- `launch_energy_req`: 发射所需能量
- `launch_material_req`: 发射所需物资
- `tick_ms`: 结算帧间隔
- `autosave_ms`: 自动存档间隔
- `reward_base`: 逃生保底星核
- `event_min_gap`: 随机事件最小间隔
- `event_max_gap`: 随机事件最大间隔
- `crate_life_seconds`: 补给舱回收窗口
- `crate_min_gain_seconds`: 补给舱折算秒数
- `kit_energy_per_level`: 开局补给每级能量
- `kit_material_per_level`: 开局补给每级物资
- `kit_research_per_level`: 开局补给每级科研
- `anchor_bonus_seconds`: 时空之锚每级增加秒
- `reward_time_divisor`: 星核时间奖励除数
- `reward_prod_divisor`: 星核产能奖励除数
- `max_crit_rate`: 暴击率上限
- `max_offline_seconds`: 离线最大秒数

### tb_building - 建筑表

16 种建筑，分为 4 个产业链。

```csv
#id,name,en,desc,chain,base_energy,base_material,base_research,base_special,scale,produces,per_sec,unlock_research,unlock_route
b_solar,太阳能阵列,SOLAR ARRAY,危机纪元最可靠的第一缕光。,energy,15,,, ,1.15,energy,0.5,,
```

- `id`: 唯一ID
- `chain`: 产业链 (energy, material, research, special)
- `base_*`: 基础消耗
- `scale`: 递增系数 (1.0-2.0)
- `produces`: 产出资源
- `per_sec`: 每秒产出
- `unlock_research`: 前置科技
- `unlock_route`: 前置路线

### tb_click_upgrade - 点击升级表

3 种点击升级。

```csv
#id,name,desc,baseCost,scale,max,effect_k,effect_v,perText
u_click,聚能矩阵,强化核心共鸣每次点击产出翻倍。,40,3.1,25,clickMult,2,点击产出 ×2
```

### tb_era - 纪元表

6 个纪元。

```csv
#id,name,en,flavor
0,危机纪元,ERA OF CRISIS,倒计时开始人类第一次为同一个目标工作。
```

### tb_research - 科技树表

16 项科技，6 个纪元。

```csv
#id,name,desc,quote,era,cost_energy,cost_material,cost_research,cost_special,req,effects
r_command,危机统筹,建立全球联合指挥部一切产出提升。,,0,,,6,, ,mult:all:1.2
```

- `era`: 所属纪元 0-5
- `cost_*`: 消耗
- `req`: 前置科技，`|` 分隔
- `effects`: 效果，`|` 分隔，格式 `mult:all:1.2` 或 `enableRoute:machine`

效果格式：

- `mult:res:v`: 产出乘区
- `clickMult:v`: 点击倍率
- `autoClick:v`: 自动点击
- `crit:v`: 暴击率
- `countdown:v`: 倒计时延长
- `enableRoute:route`: 解锁路线
- `startKit:v`: 开局补给
- `note:text`: 说明
- `final`: 终章

### tb_route - 飞升路线表

3 大路线。

```csv
#id,name,title,en,desc,perks,specialName,specialEn,requireResearch
machine,机械飞升,钢铁洪流,MECHANICAL ASCENSION,摒弃血肉将文明托付给不知疲倦的钢铁算力即是权力。,解锁建筑数据核心产出算力|专属升级重铸产能结构|自动采集能力大幅增强,算力,COMPUTE,r_ai
```

### tb_route_upgrade - 路线升级表

12 项路线升级，每路线 4 项。

```csv
#id,route,name,desc,max,baseCost,scale,effect_k,effect_res,effect_v
ru_m_furnace,machine,泰坦锻炉,能量产出 ×1.35 / 级,10,30,1.75,mult,energy,1.35
```

### tb_core_upgrade - 星核遗产表

5 项跨轮回永久升级。

```csv
#id,name,desc,max,base,inc,effect_k,effect_res,effect_v
cu_ember,永恒火种,每一轮回能量产出 ×1.3 / 级,20,6,4,mult,energy,1.3
```

- `base`: 基础星核消耗
- `inc`: 每级递增
- `effect`: 每级效果

### tb_story - 倒计时剧情表

7 条剧情，随倒计时触发。

```csv
#id,remainSec,text,tone
st_start,3599,「方舟协定」签署完毕全球资源统一调度倒计时开始。,info
```

- `remainSec`: 剩余秒阈值
- `tone`: 语气 (info, warn, danger)

### tb_random_event - 随机事件表

6 种随机事件。

```csv
#id,name,text,tone,kind,res,seconds,deadlineAdd,weight
ev_solar,太阳风暴,强烈的太阳风掠过轨道阵列充能效率暴涨。,success,instant,energy,90,,30
```

- `kind`: instant, crate, deadline
- `res`: 资源类型 (instant 时)
- `seconds`: 折算秒数 (可负)
- `deadlineAdd`: 倒计时增加秒 (deadline 时)
- `weight`: 权重

### tb_res_meta - 资源元信息表

资源展示用。

```csv
#id,name,en,color
energy,能量,ENERGY,#22d3ee
```

### tb_leaderboard_name - 排行榜名字库

30 个随机名字。

```csv
#name
文明观察者#4211
洛希极限
...
```

## 生成流程

### 1. 编辑 CSV

策划直接编辑 `server/luban/tables/*.csv`

### 2. 生成

```bash
npm run gen:luban
```

生成器 `scripts/luban-gen.mjs` 会：

- 解析所有 CSV (支持引号、转义)
- 校验：
  - 重复ID
  - 数值范围 (scale 1.0-2.0, per_sec>0, era 0-5, max 1-100)
  - 枚举合法性
  - 外键存在性
- 生成：
  - `src/game/generated/Tables.ts`
  - `src/game/generated/Beans.ts`
  - `src/game/generated/Enums.ts`
  - `src/game/generated/data/tables.json`
  - `server/internal/config/gen/tables_gen.go`

### 3. 校验

```bash
npm run validate:config
```

检查所有表是否有重复ID、非法值、缺失文件。

### 4. 前端使用

`src/game/config.ts` 导入生成表并校验：

```ts
import { GLOBAL, BUILDINGS } from "./generated/Tables";
import { validateAll } from "./configValidator";

const validation = validateAll({ global: GLOBAL, buildings: BUILDINGS, ... });
if (!validation.ok) console.warn(validation.errors);

// 若生成表缺失，自动回退到 FALLBACK_*
```

### 5. 后端使用

生成器导出两份服务端产物:

| 产物 | 用途 |
|---|---|
| `server/internal/config/gen/tables_gen.go` | Go 表(struct + 字面量),供 `ctwork/server` 模块直接 import |
| `server/data/tables.json` | 与前端同源的 JSON,可用于运行时热更/对账 |

**当前状态**:`server/internal/engine/config.go`(反作弊权威数值)仍为手写字面量,
由 `scripts/check-config-parity.mjs` 强制与 CSV 逐项一致(11 全局常量 / 16 建筑 /
3 点击升级 / 16 科技 / 12 路线升级 / 5 星核遗产),CI 与 `npm run check` 均会执行。
把 `config.go` 改为直接消费 `internal/config/gen` 即为「彻底单源」的最后一步。

## 健壮性设计

### 三层校验

1. **解析层** (`luban-gen.mjs`):
   - 表头检查
   - 列数匹配
   - 必填字段

2. **业务层** (`configValidator.ts`):
   - 范围检查与钳制
   - 枚举合法性
   - 外键存在性
   - 重复ID

3. **运行时层** (`config.ts`):
   - `safeGet`: 缺失值回退
   - `FALLBACK_*`: 默认值
   - `getConfigHealth()`: 健康检查

### 回退策略

- 若 `Tables.ts` 缺失，构建失败，提示运行 `gen:luban`
- 若某张表数据非法，校验器警告并自动修正 (如 clamp scale 到 [1.0,2.0])
- 若生成表完全缺失 (如首次克隆)，`config.ts` 使用内嵌 `FALLBACK_*` 保证可运行

### 热更支持

`configLoader.ts` 支持远程加载：

```ts
const result = await loadConfig({ url: "/config/tables.json", useCache: true });
if (result.ok) {
  console.log("Config loaded from", result.source);
}
```

## 扩展新表

1. 在 `server/luban/tables/` 新建 `tb_xxx.csv`
2. 在 `luban.conf` 注册
3. 在 `Defines/__tables__.xml` 添加定义
4. 在 `scripts/luban-gen.mjs` 添加 `genXxx()` 函数
5. 运行 `gen:luban`
6. 在 `config.ts` 导入并导出

## 最佳实践

- 所有数值必须来自 CSV，禁止在代码中写死
- 新增数值先在 `tb_global.csv` 添加，再在代码中使用 `GLOBAL.xxx`
- 建筑、科技等新增时，注意 `id` 唯一性
- 效果字符串使用统一格式 `k:res:v`，便于解析
- 提交时同时提交 CSV 与生成产物，保证一致性
- CI 中运行 `validate:config` 确保无错误

## 参考

- `server/luban/README.md`: 快速开始
- `server/luban/Defines/README.md`: XML 定义说明
- `src/game/generated/README.md`: 生成产物说明
- `docs/ARCHITECTURE.md` §3: 架构中的配置方案
- Luban 官方: https://github.com/focus-creative-games/luban
