# Defines - Luban 定义文件

此目录包含 Luban 的 XML 定义文件，用于描述枚举、Bean、表的结构。

## 文件

- `__enums__.xml`: 枚举定义
- `__beans__.xml`: Bean 定义
- `__tables__.xml`: 表定义

## 与 CSV 的关系

Luban 支持两种定义方式：

1. **XML 定义** (本目录): 传统方式，定义在 XML 中，数据在 Excel/CSV
2. **CSV 定义** (../enums, ../beans): 在 CSV 头部用 `##type=enum/bean` 定义，更加直观

本项目同时提供两种方式，保证兼容性：

- XML 定义用于官方 Luban 工具链
- CSV 定义用于快速查看与编辑

## 示例

### Enum XML

```xml
<enum name="ResourceType" comment="资源类型枚举">
  <var name="energy" value="0" comment="能量"/>
  <var name="material" value="1" comment="物资"/>
</enum>
```

### Bean XML

```xml
<bean name="Cost" comment="资源消耗结构">
  <var name="energy" type="int?" comment="能量"/>
  <var name="material" type="int?" comment="物资"/>
</bean>
```

### Table XML

```xml
<table name="tb_building" valueType="Building" mode="map" input="tb_building.csv" group="c,s" comment="建筑表">
  <index name="id"/>
</table>
```

## 生成

这些 XML 文件会被 `luban.conf` 引用，用于生成多语言代码。

当前项目使用自研的 `scripts/luban-gen.mjs` 模拟 Luban 官方生成流程，支持：

- 读取 XML 定义
- 读取 CSV 数据
- 校验数据
- 生成 TS/Go/JSON

若使用官方 Luban 工具，可直接使用这些 XML 文件。
