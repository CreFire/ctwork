# Generated - Luban 生成产物

> 此目录下所有文件由 `scripts/luban-gen.mjs` 自动生成，不要手动编辑。

## 文件说明

- `Enums.ts`: 枚举定义，来自 `server/luban/enums/*.csv` + `Defines/__enums__.xml`
- `Beans.ts`: Bean 接口定义，来自 `server/luban/beans/*.csv` + `Defines/__beans__.xml`
- `Tables.ts`: 表数据常量，来自 `server/luban/tables/*.csv`
- `data/tables.json`: JSON 数据，包含所有表，供 Go 服务端与热更使用
- `index.ts`: 入口，导出所有

## 生成方式

```bash
npm run gen:luban
```

## 使用方式

```ts
import { GLOBAL, BUILDINGS, RESEARCH } from "@/game/generated/Tables";
import { validateAll } from "@/game/configValidator";

console.log(GLOBAL.earthCountdownSeconds); // 3600
console.log(BUILDINGS.length); // 16
```

实际游戏代码应通过 `@/game/config` 导入，该文件已对生成表进行校验与回退处理：

```ts
import { GLOBAL, BUILDINGS, getConfigHealth } from "@/game/config";
```

## 健壮性

- 若生成表缺失，`config.ts` 会回退到内嵌默认值
- `configValidator.ts` 会校验所有表，非法值自动修正
- `configLoader.ts` 支持远程热更与缓存
