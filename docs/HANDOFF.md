# 任务交接 / 复现说明(HANDOFF)

> 本文档完整记录"方舟纪元 ARK ERA"从一句话需求到可玩成品的任务拆解,
> 供协作者接手开发,或在新的 AI 会话中一键复现本次任务。

---

## 1. 原始需求(种子 Prompt)

```
我想开发一个挂机休闲的网页点点游戏,类似《云隐修仙录》,
但是科技升级类型 —— 从地球倒计时爆炸开始,一路提升科技,可切换科技路线(如虫族)。
是联网升级、后续可能做成联机 PvE 的挂机游戏。

技术栈:
- 前端:React + Vite + Tailwind(开发代理自选)
- 后端:dueGame + Go + MongoDB
- 配置:Luban 方案
- 前期为网页版
- 登录:账号+密码,注册登录混合(账号不存在自动注册),一个玩家绑定一个 uid
```

## 2. 本次会话完成的任务拆解

| # | 任务 | 产物 | 状态 |
|---|------|------|------|
| 1 | 游戏系统设计(倒计时→建造→科技树→路线→轮回闭环) | 策划内嵌于代码注释 | ✅ |
| 2 | 数值配置表(16 建筑 / 18 科技 / 3 路线 12 升级 / 5 星核遗产 / 事件表) | `src/game/config.ts` | ✅ |
| 3 | 纯函数游戏引擎(产出/成本/里程碑/离线结算/轮回奖励) | `src/game/engine.ts` | ✅ |
| 4 | 模拟后端(登录即注册/uid 绑定/存档读写/会话恢复) | `src/services/mockServer.ts` | ✅ |
| 5 | 状态中枢(250ms tick / 8s 自动存档 / 随机事件 / 剧情播报) | `src/game/store.ts` | ✅ |
| 6 | 认证界面(登录注册混合 + 主视觉) | `src/components/AuthScreen.tsx` | ✅ |
| 7 | 游戏 HUD(资源栏 / 倒计时 / 程序化地球画布 / 日志 / 排行榜) | `src/components/game/*` | ✅ |
| 8 | 六个玩法页(总览/能源/建设/科技树/路线/发射) | `src/components/game/*` | ✅ |
| 9 | 过场与弹层(爆炸/点火动画、纪元结算、离线报告、补给舱) | `src/components/game/Overlays.tsx` | ✅ |
| 10 | 后端架构蓝图(dueGame + Go + MongoDB + 协议 + 反作弊) | `docs/ARCHITECTURE.md` | ✅ |
| 11 | Luban 配置表样例 | `server/luban/*.csv` | ✅ |
| 12 | 本地 Git 仓库初始化 | `git init` + 首次提交 | ✅ |
| 13 | dueGame 后端 v0.1(五接口/反作弊/双端一致性/真排行榜) | `server/` 全套 + `scripts/gen-fixture.mjs` + `scripts/e2e.py` | ✅ |
| 14 | 文明编年史/墓碑/快照(RunRecord 落笔、墓志铭、现状总览) | `src/components/game/ChronicleTab.tsx` + engine/store/Go 同步 | ✅ |
| 15 | Luban 配置驱动体系(12 表 / 6 枚举 / 12 Bean + 生成器 + 校验器) | `server/luban/**` + `scripts/luban-gen.mjs` + `src/game/generated/**` | ✅ |
| 16 | 双分支合并:配置单源化 + 一致性守卫 + 冒烟/CI | `scripts/check-config-parity.mjs` + `scripts/smoke-engine.mjs` + `.github/workflows/ci.yml` | ✅ |

**待办(接手从这里开始)**

- [x] 推送到 GitHub(仓库:`CreFire/ctwork`)
- [x] dueGame 后端:v0.1 HTTP 五接口(协议见 `docs/ARCHITECTURE.md` §2.3)
      → 已实现于 `server/`(Go 单进程网关:auth/player/league + JWT + 限流 + 反作弊校验,
        存储 filestore 默认 / mongostore 可选;双端公式一致性由 `scripts/gen-fixture.mjs`
        + `server/internal/engine/engine_test.go` 保证)
- [x] Luban 工程化:CSV 表 + `npm run gen` 导出 TS/Go/JSON,`src/game/config.ts` 已改为读生成表
      → 前端数值 100% 来自 `server/luban/tables/*.csv`(经 `configValidator` 校验/钳制/回退),
        并用 `scripts/gen-fixture.mjs` 验证迁移前后引擎输出逐字段一致(仅新增 `first_event_delay_seconds` 配置项)
- [ ] Luban 收尾:让 `server/internal/engine/config.go` 直接消费 `server/internal/config/gen`
      (当前为手写字面量,由 `npm run check:parity` 强制与 CSV 一致;删掉手写字面量即完成单源)
- [x] 服务端权威校验:资源增量上限、购买重算(反作弊 v0.1 已实现,见 README)
- [ ] v0.2:WebSocket 长连接、服务端离线结算、赛季
- [ ] v0.3:联机 PvE「流浪黑洞」讨伐

## 3. 一键复现(给新 AI 会话)

把下面这段贴给任意编程类 AI,即可重建本项目骨架:

```
用 React19 + Vite + Tailwind4 + Zustand + Framer Motion + lucide-react
实现一款科技挂机网页游戏"方舟纪元":
- 地球解体实时倒计时(1小时/轮),倒计时归零爆炸进入轮回
- 资源:能量(可点击核心采集,含自动点击/暴击)/ 物资 / 科研 / 路线特殊资源
- 建筑三类产业链共16种,几何递价 1.15+,每25座产出翻倍
- 六纪元科技树18项,几何前置解锁,效果为产出乘区/解锁建筑/解锁路线
- 三大飞升路线(机械=算力 / 蜂群=生物质 / 灵能=灵能),专属建筑+4升级,可切换
- 发射=满足[曲率引擎科技 + 25万能量 + 2.5万物资],成功后轮回;
  星核奖励 = 3 + √(累计产能/1e6) + 剩余秒/600;毁灭则 1 + 折算一半
- 星核遗产5种跨轮回(能量/物资/科研 ×, 倒计时+10min/级, 开局补给)
- 离线结算:50%效率上限8h;休眠期间超期则按死亡结算
- 数字按中文 万/亿/万亿/京 格式化
- 登录:账号+密码一键登录即注册,uid 绑定,localStorage 模拟服务器,
  接口预留对接 dueGame(Go)+MongoDB 五接口协议
- 视觉:深空暗色 + 程序化绘制的地球(裂纹随倒计时恶化)+ 星空视差画布
```

## 4. 分享方式

- **分享本对话**:在所用 AI 平台界面找「分享 / Share」按钮生成公开链接(通常在会话右上角菜单);注意链接会包含完整对话内容。
- **分享代码**:推送到 GitHub 后发仓库链接即可;README 已含玩法与运行说明。
- **只分享任务**:直接把 §1 或 §3 的文本发给对方。
