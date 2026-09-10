/**
 * ============================================================
 * 服务端权威校验(反作弊 v0.1)
 * ============================================================
 * docs/ARCHITECTURE.md §2.4:
 *  1. 资源增量上限:Δres ≤ 理论最大产出 × Δt × 容差
 *  2. 购买审计:成本按表重算,不信任客户端提交的购买数
 *  3. 科技前置链、等级上限、倒计时单调性、星核/轮回增量钳制
 * 策略:可修正的作弊一律「钳制/回退 + 告警」而非拒收,避免误伤。
 * ============================================================
 */
package engine

import (
	"math"
)

var validRoutes = map[string]bool{"machine": true, "swarm": true, "psionic": true}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func clampRes(v float64) float64 {
	if !finite(v) || v < 0 {
		return 0
	}
	return v
}

func clampCount(v, max float64) float64 {
	if !finite(v) || v < 0 {
		return 0
	}
	v = math.Floor(v)
	if max > 0 && v > max {
		return max
	}
	return v
}

// Sanitize 结构清洗:丢弃未知 id / 钳制非法数值 / 修正溢出等级。原地修改并返回告警。
func Sanitize(s *SaveState) []string {
	var warns []string

	// 路线
	if s.Run.Route != nil && !validRoutes[*s.Run.Route] {
		s.Run.Route = nil
		warns = append(warns, "run.route 非法,已重置")
	}
	// 资源
	for _, k := range ResKeys {
		if v := s.Run.Res[k]; !finite(v) || v < 0 {
			s.Run.Res[k] = 0
			warns = append(warns, "res."+k+" 非法,已归零")
		}
	}
	// 建筑:未知 id 移除,数量取整
	cleanB := make(map[string]float64, len(s.Run.Buildings))
	for id, n := range s.Run.Buildings {
		if BuildingOf(id) == nil {
			warns = append(warns, "未知建筑 "+id+",已移除")
			continue
		}
		cleanB[id] = clampCount(n, 0)
	}
	s.Run.Buildings = cleanB
	// 科技:仅保留已知 id
	cleanR := map[string]bool{}
	for id, on := range s.Run.Research {
		if on && ResearchOf(id) != nil {
			cleanR[id] = true
		}
	}
	s.Run.Research = cleanR
	// 点击升级
	cleanC := map[string]float64{}
	for id, lvl := range s.Run.ClickUp {
		def := ClickUpgradeOf(id)
		if def == nil {
			continue
		}
		if lvl = clampCount(lvl, float64(def.Max)); lvl > 0 {
			cleanC[id] = lvl
		}
	}
	s.Run.ClickUp = cleanC
	// 路线升级
	cleanU := map[string]float64{}
	for id, lvl := range s.Run.RouteUp {
		def := RouteUpgradeOf(id)
		if def == nil {
			continue
		}
		if lvl = clampCount(lvl, float64(def.Max)); lvl > 0 {
			cleanU[id] = lvl
		}
	}
	s.Run.RouteUp = cleanU
	// 星核遗产
	cleanK := map[string]float64{}
	for id, lvl := range s.Meta.CoreUp {
		def := CoreUpgradeOf(id)
		if def == nil {
			continue
		}
		if lvl = clampCount(lvl, float64(def.Max)); lvl > 0 {
			cleanK[id] = lvl
		}
	}
	s.Meta.CoreUp = cleanK
	// meta 数值
	type numField struct {
		name string
		v    *float64
	}
	for _, m := range []numField{
		{"cores", &s.Meta.Cores}, {"runs", &s.Meta.Runs}, {"escapes", &s.Meta.Escapes},
		{"deaths", &s.Meta.Deaths}, {"bestRemainSec", &s.Meta.BestRemainSec},
		{"totalEnergy", &s.Meta.TotalEnergy}, {"totalClicks", &s.Meta.TotalClicks},
		{"energyTotal", &s.Run.Stats.EnergyTotal}, {"clicks", &s.Run.Stats.Clicks},
	} {
		if !finite(*m.v) || *m.v < 0 {
			*m.v = 0
			warns = append(warns, "meta."+m.name+" 非法,已归零")
		}
	}

	// 编年史:清洗每条记录并按容量截断(保留最新)
	if len(s.Meta.History) > MaxHistory {
		s.Meta.History = s.Meta.History[:MaxHistory]
	}
	cleanH := make([]RunRecord, 0, len(s.Meta.History))
	for _, r := range s.Meta.History {
		if r.RunID < 0 || !finite(r.StartedAt) || !finite(r.EndedAt) || r.StartedAt < 0 || r.EndedAt < 0 {
			continue
		}
		if r.Route != nil && !validRoutes[*r.Route] {
			r.Route = nil
		}
		r.DurationSec = clampCount(r.DurationSec, 1e7)
		r.Era = clampCount(r.Era, 10)
		r.ResearchCount = clampCount(r.ResearchCount, 1000)
		r.BuildingsTotal = clampCount(r.BuildingsTotal, 1e6)
		r.EnergyTotal = clampCount(r.EnergyTotal, 1e18)
		r.Clicks = clampCount(r.Clicks, 1e9)
		r.Cores = clampCount(r.Cores, 1e9)
		r.RemainSec = clampCount(r.RemainSec, 1e6)
		r.Epitaph = truncateRunes(r.Epitaph, 120)
		cleanH = append(cleanH, r)
	}
	s.Meta.History = cleanH
	return warns
}

// truncateRunes 按字符数截断(防超长铭文撑爆存档)
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// durationOf 本轮回基础时长(地球倒计时 + 时空之锚加成)
func durationOf(s *SaveState) float64 {
	return EarthCountdownSeconds + s.Meta.CoreUp["cu_anchor"]*600.0
}

func strPtrEq(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// Validate 服务端权威校验。
//   old: 服务端最近一次接受的存档(nil = 首次建档,如从 mockServer 迁移)
//   nw:  客户端本次推送的存档
//   dtSec: 服务端两次接收的时间差(秒,服务端时钟,免疫客户端改时间)
//   nowMs: 服务端当前毫秒
// 返回清洗后的权威存档与告警列表。
func Validate(old, nw *SaveState, dtSec float64, nowMs float64) (*SaveState, []string) {
	var warns []string
	nw = Clone(nw)
	warns = append(warns, Sanitize(nw)...)

	// 首次建档:仅做结构兜底(信任初始档,存档迁移场景)
	if old == nil {
		if nw.Run.StartedAt <= 0 {
			nw.Run.StartedAt = nowMs
		}
		if nw.Run.DeadlineAt <= nw.Run.StartedAt {
			nw.Run.DeadlineAt = nw.Run.StartedAt + durationOf(nw)*1000
		}
		if nw.LastTickAt <= 0 || nw.LastTickAt > nowMs+300000 {
			nw.LastTickAt = nowMs
		}
		return nw, warns
	}

	oc := Clone(old)

	// 0) 关键时间戳兜底
	if nw.Run.StartedAt <= 0 {
		nw.Run.StartedAt = oc.Run.StartedAt
	}
	if nw.LastTickAt <= 0 {
		nw.LastTickAt = oc.LastTickAt
	}
	if nw.LastTickAt > nowMs+300000 { // 客户端时钟漂移到未来
		nw.LastTickAt = oc.LastTickAt
		warns = append(warns, "lastTickAt 来自未来,已回退")
	}

	// 1) 科技前置链:前置未满足 → 视为未研究
	for i := range Research {
		def := &Research[i]
		if !nw.Run.Research[def.ID] {
			continue
		}
		for _, q := range def.Req {
			if !nw.Run.Research[q] {
				nw.Run.Research[def.ID] = false
				warns = append(warns, "科技 "+def.ID+" 前置不满足,已回退")
				break
			}
		}
	}

	// 2) 资源增量上限(旧/新状态理论产出的较大者 × 1.2 容差)
	gOld := ExpectedGains(oc, dtSec)
	gNew := ExpectedGains(nw, dtSec)
	for _, k := range ResKeys {
		expect := math.Max(gOld[k], gNew[k])
		capRes := oc.Run.Res[k] + expect*1.2 + 1
		if nw.Run.Res[k] > capRes {
			nw.Run.Res[k] = capRes
			warns = append(warns, "资源 "+k+" 增量超出理论上限,已回收")
		}
	}

	// 3) 购买审计(宽裕系数 1.3,分项审计;「可用」= 旧资源 + 理论产出)
	pool := map[string]float64{}
	for _, k := range ResKeys {
		pool[k] = oc.Run.Res[k] + math.Max(gOld[k], gNew[k])
	}
	const slack = 1.3

	switchedRoute := !strPtrEq(nw.Run.Route, oc.Run.Route)
	if switchedRoute && nw.Run.Route != nil {
		// 换路线:客户端会清空 routeUp 与 special,这里重置审计基线
		for id := range nw.Run.RouteUp {
			def := RouteUpgradeOf(id)
			if def == nil || def.Route != *nw.Run.Route {
				delete(nw.Run.RouteUp, id)
			}
		}
	}

	// 3a) 建筑
	for id, n1 := range nw.Run.Buildings {
		n0 := oc.Run.Buildings[id]
		if n1 <= n0 {
			continue
		}
		cost := CumulativeCost(BuildingOf(id), n0, n1)
		if cost.Energy > pool[ResEnergy]*slack+1 || cost.Material > pool[ResMaterial]*slack+1 ||
			cost.Research > pool[ResResearch]*slack+1 || cost.Special > pool[ResSpecial]*slack+1 {
			nw.Run.Buildings[id] = n0
			warns = append(warns, "建筑 "+id+" 增量无法支付,已回退")
		}
	}
	// 3b) 科技(新点亮逐项审计)
	for i := range Research {
		def := &Research[i]
		if nw.Run.Research[def.ID] && !oc.Run.Research[def.ID] {
			if def.Cost.Energy > pool[ResEnergy]*slack+1 || def.Cost.Material > pool[ResMaterial]*slack+1 ||
				def.Cost.Research > pool[ResResearch]*slack+1 {
				nw.Run.Research[def.ID] = false
				warns = append(warns, "科技 "+def.ID+" 无法支付,已回退")
			}
		}
	}
	// 3c) 点击升级(能量池)
	for id, l1 := range nw.Run.ClickUp {
		l0 := oc.Run.ClickUp[id]
		if l1 <= l0 {
			continue
		}
		def := ClickUpgradeOf(id)
		if CumulativeLevelCost(def.BaseCost, def.Scale, l0, l1) > pool[ResEnergy]*slack+1 {
			nw.Run.ClickUp[id] = l0
			warns = append(warns, "点击升级 "+id+" 无法支付,已回退")
		}
	}
	// 3d) 路线升级(特殊资源池;换路线后从 0 审计)
	for id, l1 := range nw.Run.RouteUp {
		l0 := 0.0
		if !switchedRoute {
			l0 = oc.Run.RouteUp[id]
		}
		if l1 <= l0 {
			continue
		}
		def := RouteUpgradeOf(id)
		if CumulativeLevelCost(def.BaseCost, def.Scale, l0, l1) > pool[ResSpecial]*slack+1 {
			nw.Run.RouteUp[id] = l0
			warns = append(warns, "路线升级 "+id+" 无法支付,已回退")
		}
	}
	// 3e) 轮回计数封顶(8 秒一跳,单次推档不可能刷多轮)—— 先钳制,星核审计用钳制后的值
	deltaRuns := nw.Meta.Runs - oc.Meta.Runs
	if deltaRuns < 0 || deltaRuns > 5 {
		nw.Meta.Runs = oc.Meta.Runs + math.Min(math.Max(deltaRuns, 0), 5)
		warns = append(warns, "轮回计数异常,已钳制")
	}
	nw.Meta.Escapes = math.Min(nw.Meta.Escapes, nw.Meta.Runs)
	nw.Meta.Deaths = math.Min(nw.Meta.Deaths, nw.Meta.Runs)
	if nw.Meta.TotalEnergy < oc.Meta.TotalEnergy-1 {
		nw.Meta.TotalEnergy = oc.Meta.TotalEnergy
		warns = append(warns, "累计产能回退,已恢复")
	}
	// 星核增量审计
	maxProd := math.Max(oc.Meta.TotalEnergy, nw.Meta.TotalEnergy) + math.Max(gOld[ResEnergy], gNew[ResEnergy]) + 1
	rewardMax := RewardBase + math.Sqrt(maxProd/1e6) + 10 // 单轮上限:3 + √产能 + 剩余时间奖励宽限
	coreCap := oc.Meta.Cores + math.Max(0, nw.Meta.Runs-oc.Meta.Runs)*rewardMax + 1
	if nw.Meta.Cores > coreCap {
		nw.Meta.Cores = coreCap
		warns = append(warns, "星核增量异常,已钳制")
	}
	// 星核遗产等级购买审计(星核池)
	for id, l1 := range nw.Meta.CoreUp {
		l0 := oc.Meta.CoreUp[id]
		if l1 <= l0 {
			continue
		}
		def := CoreUpgradeOf(id)
		if CumulativeCoreUpCost(def.Base, def.Inc, l0, l1) > coreCap+math.Sqrt(math.Max(0, nw.Meta.Cores))*rewardMax+1 {
			nw.Meta.CoreUp[id] = l0
			warns = append(warns, "星核遗产 "+id+" 无法支付,已回退")
		}
	}

	// 4) 倒计时单调性与轮回结构
	duration := durationOf(nw)
	if nw.Run.RunID > oc.Run.RunID { // 新轮回
		if nw.Run.StartedAt < oc.Run.StartedAt || nw.Run.StartedAt > nowMs+300000 {
			nw.Run.StartedAt = float64(nowMs)
			warns = append(warns, "新轮回开始时间异常,已重建")
		}
		minD := nw.Run.StartedAt + duration*1000
		maxD := nw.Run.StartedAt + (duration+7200)*1000
		if nw.Run.DeadlineAt < minD || !finite(nw.Run.DeadlineAt) {
			nw.Run.DeadlineAt = minD
			warns = append(warns, "新轮回倒计时异常,已重建")
		} else if nw.Run.DeadlineAt > maxD {
			nw.Run.DeadlineAt = maxD
			warns = append(warns, "新轮回倒计时超上限,已钳制")
		}
	} else if nw.Run.RunID == oc.Run.RunID { // 同一轮
		if nw.Run.DeadlineAt < oc.Run.DeadlineAt-1000 { // 加时事件只会延长
			nw.Run.DeadlineAt = oc.Run.DeadlineAt
			warns = append(warns, "倒计时被回拨,已恢复")
		}
		if nw.Run.DeadlineAt > oc.Run.DeadlineAt+3600*1000 {
			nw.Run.DeadlineAt = oc.Run.DeadlineAt + 3600*1000
			warns = append(warns, "倒计时加时超上限,已钳制")
		}
		if nw.Run.Stats.EnergyTotal < oc.Run.Stats.EnergyTotal-1 {
			nw.Run.Stats.EnergyTotal = oc.Run.Stats.EnergyTotal
		}
	} else { // RunID 回退
		nw.Run.RunID = oc.Run.RunID
		nw.Run.StartedAt = oc.Run.StartedAt
		nw.Run.DeadlineAt = oc.Run.DeadlineAt
		warns = append(warns, "轮回编号回退,已恢复")
	}

	return nw, warns
}
