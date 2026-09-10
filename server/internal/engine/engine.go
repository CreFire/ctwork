/**
 * ============================================================
 * 方舟纪元 — 服务端权威公式引擎
 * ============================================================
 * 与前端 src/game/engine.ts 保持同一套公式与相同的浮点运算顺序
 * (docs/ARCHITECTURE.md §2.4 反作弊:生产公式以服务端为准)。
 * 一致性由 engine_test.go + testdata/fixture.json(TS 端生成)保证。
 * ============================================================
 */
package engine

import (
	"encoding/json"
	"math"
)

// —— 存档结构(与前端 SaveState JSON 字段一一对应) ——

type RunStats struct {
	EnergyTotal float64 `json:"energyTotal"`
	Clicks      float64 `json:"clicks"`
}

type RunState struct {
	RunID        int                `json:"runId"`
	StartedAt    float64            `json:"startedAt"`
	DeadlineAt   float64            `json:"deadlineAt"`
	Res          map[string]float64 `json:"res"`
	Route        *string            `json:"route"` // null | "machine" | "swarm" | "psionic"
	Buildings    map[string]float64 `json:"buildings"`
	Research     map[string]bool    `json:"research"`
	ClickUp      map[string]float64 `json:"clickUp"`
	RouteUp      map[string]float64 `json:"routeUp"`
	FiredStories []string           `json:"firedStories"`
	NextEventAt  float64            `json:"nextEventAt"`
	Stats        RunStats           `json:"stats"`
}

// RunRecord 文明编年史单条记录(escaped=false 即文明墓碑),与前端 RunRecord 对齐
type RunRecord struct {
	RunID          int     `json:"runId"`
	StartedAt      float64 `json:"startedAt"`
	EndedAt        float64 `json:"endedAt"`
	DurationSec    float64 `json:"durationSec"`
	Escaped        bool    `json:"escaped"`
	Route          *string `json:"route"`
	Era            float64 `json:"era"`
	ResearchCount  float64 `json:"researchCount"`
	BuildingsTotal float64 `json:"buildingsTotal"`
	EnergyTotal    float64 `json:"energyTotal"`
	Clicks         float64 `json:"clicks"`
	Cores          float64 `json:"cores"`
	RemainSec      float64 `json:"remainSec"`
	Epitaph        string  `json:"epitaph"`
}

// MaxHistory 编年史容量(新纪录在前,超出截断)
const MaxHistory = 40

type MetaState struct {
	Cores         float64            `json:"cores"`
	CoreUp        map[string]float64 `json:"coreUp"`
	Runs          float64            `json:"runs"`
	Escapes       float64            `json:"escapes"`
	Deaths        float64            `json:"deaths"`
	BestRemainSec float64            `json:"bestRemainSec"`
	TotalEnergy   float64            `json:"totalEnergy"`
	TotalClicks   float64            `json:"totalClicks"`
	History       []RunRecord        `json:"history,omitempty"`
}

type SaveState struct {
	Version    int       `json:"version"`
	UID        string    `json:"uid"`
	CreatedAt  float64   `json:"createdAt"`
	LastTickAt float64   `json:"lastTickAt"`
	Run        RunState  `json:"run"`
	Meta       MetaState `json:"meta"`
}

func FromJSON(b []byte) (*SaveState, error) {
	var s SaveState
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *SaveState) ToJSON() ([]byte, error) { return json.Marshal(s) }

// Clone 深拷贝
func Clone(s *SaveState) *SaveState {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	var c SaveState
	if err := json.Unmarshal(b, &c); err != nil {
		panic(err)
	}
	return &c
}

// —— 派生属性 ——

type Derived struct {
	Rates      map[string]float64 // 最终每秒产出
	ClickPower float64            // 单次点击产出
	AutoClicks float64            // 每秒自动点击次数
	AutoRate   float64            // 自动点击带来的能量/秒
	Crit       float64            // 暴击率
}

// ComputeDerived 与前端 computeDerived 逐行同构。
// 迭代顺序与 TS 端一致(表数组顺序 / ResKeys 顺序),保证 IEEE754 浮点结果一致。
func ComputeDerived(s *SaveState) Derived {
	base := map[string]float64{ResEnergy: 0, ResMaterial: 0, ResResearch: 0, ResSpecial: 0}
	mkOnes := func() map[string]float64 {
		return map[string]float64{ResEnergy: 1, ResMaterial: 1, ResResearch: 1, ResSpecial: 1}
	}
	srcResearch, srcRoute, srcCore := mkOnes(), mkOnes(), mkOnes()
	clickUpMult := 1.0
	autoClick := 0.0
	crit := 0.0

	// 1) 建筑基础产出(含 25 座里程碑翻倍)
	for i := range Buildings {
		def := &Buildings[i]
		count := s.Run.Buildings[def.ID]
		if count == 0 {
			continue
		}
		if def.Produces == ResSpecial && (s.Run.Route == nil || *s.Run.Route != def.UnlockRoute) {
			continue
		}
		mm := math.Pow(MilestoneMult, math.Floor(count/MilestoneEvery))
		base[def.Produces] += count * def.PerSec * mm
	}

	// 2a) 科技乘区
	for i := range Research {
		def := &Research[i]
		if !s.Run.Research[def.ID] {
			continue
		}
		for _, e := range def.Effects {
			if e.K == EffMult {
				if e.Res == "all" {
					for _, k := range ResKeys {
						srcResearch[k] *= e.V
					}
				} else {
					srcResearch[e.Res] *= e.V
				}
			}
		}
	}

	// 2b) 点击升级
	for i := range ClickUpgrades {
		def := &ClickUpgrades[i]
		lvl := s.Run.ClickUp[def.ID]
		if lvl == 0 {
			continue
		}
		switch def.Eff.K {
		case EffClickMult:
			clickUpMult *= math.Pow(def.Eff.V, lvl)
		case EffAutoClick:
			autoClick += def.Eff.V * lvl
		case EffCrit:
			crit += def.Eff.V * lvl
		}
	}

	// 2c) 路线升级(仅当前路线生效)
	for i := range RouteUpgrades {
		def := &RouteUpgrades[i]
		lvl := s.Run.RouteUp[def.ID]
		if lvl == 0 || s.Run.Route == nil || def.Route != *s.Run.Route {
			continue
		}
		switch def.Eff.K {
		case EffMult:
			if def.Eff.Res == "all" {
				for _, k := range ResKeys {
					srcRoute[k] *= math.Pow(def.Eff.V, lvl)
				}
			} else {
				srcRoute[def.Eff.Res] *= math.Pow(def.Eff.V, lvl)
			}
		case EffClickMult:
			clickUpMult *= math.Pow(def.Eff.V, lvl)
		case EffAutoClick:
			autoClick += def.Eff.V * lvl
		case EffCrit:
			crit += def.Eff.V * lvl
		}
	}

	// 2d) 星核遗产(跨轮回乘区)
	for i := range CoreUpgrades {
		def := &CoreUpgrades[i]
		lvl := s.Meta.CoreUp[def.ID]
		if lvl == 0 {
			continue
		}
		if def.Eff.K == EffMult {
			v := math.Pow(def.Eff.V, lvl)
			if def.Eff.Res == "all" {
				for _, k := range ResKeys {
					srcCore[k] *= v
				}
			} else {
				srcCore[def.Eff.Res] *= v
			}
		}
	}

	// 3) 汇总
	rates := make(map[string]float64, 4)
	for _, k := range ResKeys {
		mult := srcResearch[k] * srcRoute[k] * srcCore[k]
		rates[k] = base[k] * mult
	}
	d := Derived{
		Rates:      rates,
		ClickPower: ClickBasePower * clickUpMult,
		AutoClicks: autoClick,
		Crit:       math.Min(crit, 0.95),
	}
	d.AutoRate = d.AutoClicks * d.ClickPower
	return d
}

// —— 成本公式 ——

// ScaleCost 单台成本:ceil(base × scale^owned),与前端 scaleCost 一致
func ScaleCost(base Cost, scale, owned float64) Cost {
	m := math.Pow(scale, owned)
	c := Cost{}
	if base.Energy != 0 {
		c.Energy = math.Ceil(base.Energy * m)
	}
	if base.Material != 0 {
		c.Material = math.Ceil(base.Material * m)
	}
	if base.Research != 0 {
		c.Research = math.Ceil(base.Research * m)
	}
	if base.Special != 0 {
		c.Special = math.Ceil(base.Special * m)
	}
	return c
}

func addCost(dst, c Cost) Cost {
	dst.Energy += c.Energy
	dst.Material += c.Material
	dst.Research += c.Research
	dst.Special += c.Special
	return dst
}

// CumulativeCost 建筑 from→to 座(不含)的累计成本(逐台 ceil 求和,与客户端逐台购买一致)
func CumulativeCost(def *BuildingDef, from, to float64) Cost {
	c := Cost{}
	if def == nil || to <= from {
		return c
	}
	if to-from > 100000 {
		to = from + 100000
	}
	for k := math.Floor(from); k < to; k++ {
		c = addCost(c, ScaleCost(def.BaseCost, def.Scale, k))
	}
	return c
}

// LevelCost 通用等级成本 ceil(base × scale^lvl)(点击升级 / 路线升级与前端 specialCost 同式)
func LevelCost(base, scale, lvl float64) float64 {
	return math.Ceil(base * math.Pow(scale, lvl))
}

// CumulativeLevelCost 等级 from→to(不含)累计成本
func CumulativeLevelCost(base, scale, from, to float64) float64 {
	if to <= from {
		return 0
	}
	if to-from > 100000 {
		to = from + 100000
	}
	sum := 0.0
	for k := math.Floor(from); k < to; k++ {
		sum += LevelCost(base, scale, k)
	}
	return sum
}

// CoreUpCost 星核遗产成本 base + inc×lvl,与前端 coreCost 一致
func CoreUpCost(base, inc, lvl float64) float64 {
	return base + inc*lvl
}

// CumulativeCoreUpCost 星核遗产 from→to(不含)累计成本
func CumulativeCoreUpCost(base, inc, from, to float64) float64 {
	if to <= from {
		return 0
	}
	if to-from > 100000 {
		to = from + 100000
	}
	sum := 0.0
	for k := math.Floor(from); k < to; k++ {
		sum += CoreUpCost(base, inc, k)
	}
	return sum
}

// —— 产出预期(反作弊基准) ——

// ExpectedGains 在 dtSec 时间窗内的理论产出。
// 短窗(≤90s)按在线口径(全效率 + 极限点击余量 15 次/秒);
// 长窗按离线口径(50% 效率,8h 封顶)——与前端 applyOffline 同式。
func ExpectedGains(s *SaveState, dtSec float64) map[string]float64 {
	g := map[string]float64{ResEnergy: 0, ResMaterial: 0, ResResearch: 0, ResSpecial: 0}
	if s == nil || dtSec <= 0 {
		return g
	}
	d := ComputeDerived(s)
	if dtSec > 90 {
		t := math.Min(dtSec, OfflineCapHours*3600)
		for _, k := range ResKeys {
			g[k] = d.Rates[k] * t * OfflineEfficiency
		}
		g[ResEnergy] += d.AutoRate * t * OfflineEfficiency
		return g
	}
	for _, k := range ResKeys {
		g[k] = d.Rates[k] * dtSec
	}
	g[ResEnergy] += d.AutoRate * dtSec
	// 点击余量:人类极限约 15 次/秒,按平均暴击系数折算
	avgCrit := 1 + (CritMult-1)*d.Crit
	g[ResEnergy] += d.ClickPower * 15 * dtSec * avgCrit
	return g
}

// —— 轮回结算 ——

// RewardBreakdown 星核结算(与前端 computeReward 同式)
type RewardBreakdown struct {
	Base       float64
	Production float64
	Time       float64
	Total      float64
	Escaped    bool
}

func ComputeReward(s *SaveState, escaped bool, nowMs float64) RewardBreakdown {
	produced := math.Max(0, s.Run.Stats.EnergyTotal)
	prodPart := math.Floor(math.Sqrt(produced / 1e6))
	remainSec := math.Max(0, (s.Run.DeadlineAt-nowMs)/1000)
	if escaped {
		timePart := math.Floor(remainSec / 600)
		return RewardBreakdown{Base: RewardBase, Production: prodPart, Time: timePart, Total: RewardBase + prodPart + timePart, Escaped: true}
	}
	half := math.Floor(prodPart / 2)
	return RewardBreakdown{Base: 1, Production: half, Total: 1 + half}
}
