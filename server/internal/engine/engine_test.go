package engine

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ============================================================
// TS↔Go 双端一致性测试
// fixture 由 scripts/gen-fixture.mjs 生成:在 Node 里执行前端
// src/game/engine.ts,把期望值落盘,Go 载入同一存档逐字段比对。
// ============================================================

type fixtureFile struct {
	Cases []struct {
		Name       string             `json:"name"`
		Save       json.RawMessage    `json:"save"`
		Rates      map[string]float64 `json:"rates"`
		ClickPower float64            `json:"clickPower"`
		AutoClicks float64            `json:"autoClicks"`
		AutoRate   float64            `json:"autoRate"`
		Crit       float64            `json:"crit"`
	} `json:"cases"`
	Offline struct {
		Save       json.RawMessage    `json:"save"`
		Now        float64            `json:"now"`
		LastTickAt float64            `json:"lastTickAt"`
		Gains      map[string]float64 `json:"gains"`
		Seconds    float64            `json:"seconds"`
	} `json:"offline"`
	Rewards []struct {
		Name    string          `json:"name"`
		Save    json.RawMessage `json:"save"`
		Escaped bool            `json:"escaped"`
		Now     float64         `json:"now"`
		Total   float64         `json:"total"`
	} `json:"rewards"`
	Costs []struct {
		Name   string  `json:"name"`
		Kind   string  `json:"kind"`
		Base   Cost    `json:"base"`
		Scale  float64 `json:"scale"`
		Owned  float64 `json:"owned"`
		Expect Cost    `json:"expect"`
		Scalar float64 `json:"scalar"`
	} `json:"costs"`
}

func loadFixture(t *testing.T) *fixtureFile {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "fixture.json"))
	if err != nil {
		t.Skipf("fixture 不存在(先运行 node scripts/gen-fixture.mjs): %v", err)
	}
	var f fixtureFile
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("fixture 解析失败: %v", err)
	}
	return &f
}

func almostEq(a, b float64) bool {
	if a == b {
		return true
	}
	return math.Abs(a-b) <= 1e-9*math.Max(1, math.Max(math.Abs(a), math.Abs(b)))
}

func TestComputeDerived_ParityWithTS(t *testing.T) {
	f := loadFixture(t)
	if len(f.Cases) == 0 {
		t.Fatal("fixture 无派生用例")
	}
	for _, c := range f.Cases {
		s, err := FromJSON(c.Save)
		if err != nil {
			t.Fatalf("%s: 存档解析失败: %v", c.Name, err)
		}
		d := ComputeDerived(s)
		for _, k := range ResKeys {
			if !almostEq(d.Rates[k], c.Rates[k]) {
				t.Errorf("%s: rates[%s] = %v, TS 期望 %v", c.Name, k, d.Rates[k], c.Rates[k])
			}
		}
		if !almostEq(d.ClickPower, c.ClickPower) {
			t.Errorf("%s: clickPower = %v, 期望 %v", c.Name, d.ClickPower, c.ClickPower)
		}
		if !almostEq(d.AutoClicks, c.AutoClicks) {
			t.Errorf("%s: autoClicks = %v, 期望 %v", c.Name, d.AutoClicks, c.AutoClicks)
		}
		if !almostEq(d.AutoRate, c.AutoRate) {
			t.Errorf("%s: autoRate = %v, 期望 %v", c.Name, d.AutoRate, c.AutoRate)
		}
		if !almostEq(d.Crit, c.Crit) {
			t.Errorf("%s: crit = %v, 期望 %v", c.Name, d.Crit, c.Crit)
		}
	}
}

func TestExpectedGains_OfflineParityWithTS(t *testing.T) {
	f := loadFixture(t)
	s, err := FromJSON(f.Offline.Save)
	if err != nil {
		t.Fatalf("离线用例存档解析失败: %v", err)
	}
	dtSec := (f.Offline.Now - f.Offline.LastTickAt) / 1000
	g := ExpectedGains(s, dtSec)
	for _, k := range ResKeys {
		if !almostEq(g[k], f.Offline.Gains[k]) {
			t.Errorf("离线收益 %s = %v, TS 期望 %v", k, g[k], f.Offline.Gains[k])
		}
	}
}

func TestComputeReward_ParityWithTS(t *testing.T) {
	f := loadFixture(t)
	for _, c := range f.Rewards {
		s, err := FromJSON(c.Save)
		if err != nil {
			t.Fatalf("%s: 存档解析失败: %v", c.Name, err)
		}
		r := ComputeReward(s, c.Escaped, c.Now)
		if !almostEq(r.Total, c.Total) {
			t.Errorf("%s: 星核 = %v, TS 期望 %v", c.Name, r.Total, c.Total)
		}
	}
}

func TestCosts_ParityWithTS(t *testing.T) {
	f := loadFixture(t)
	for _, c := range f.Costs {
		switch c.Kind {
		case "scaleCost":
			got := ScaleCost(c.Base, c.Scale, c.Owned)
			if !almostEq(got.Energy, c.Expect.Energy) || !almostEq(got.Material, c.Expect.Material) ||
				!almostEq(got.Research, c.Expect.Research) || !almostEq(got.Special, c.Expect.Special) {
				t.Errorf("%s: got %+v, 期望 %+v", c.Name, got, c.Expect)
			}
		case "specialCost":
			if !almostEq(LevelCost(c.Base.Energy, c.Scale, c.Owned), c.Scalar) {
				t.Errorf("%s: got %v, 期望 %v", c.Name, LevelCost(c.Base.Energy, c.Scale, c.Owned), c.Scalar)
			}
		case "coreCost":
			if !almostEq(CoreUpCost(c.Base.Energy, c.Scale, c.Owned), c.Scalar) {
				t.Errorf("%s: got %v, 期望 %v", c.Name, CoreUpCost(c.Base.Energy, c.Scale, c.Owned), c.Scalar)
			}
		default:
			t.Errorf("未知成本用例类型 %q", c.Kind)
		}
	}
}

// ============================================================
// 反作弊行为测试
// ============================================================

func newTestSave(uid string, now float64) *SaveState {
	s := &SaveState{
		Version:    Version,
		UID:        uid,
		CreatedAt:  now - 60000,
		LastTickAt: now,
	}
	s.Run = RunState{
		RunID:        1,
		StartedAt:    now - 60000,
		DeadlineAt:   now - 60000 + EarthCountdownSeconds*1000,
		Res:          map[string]float64{ResEnergy: 100, ResMaterial: 20, ResResearch: 5, ResSpecial: 0},
		Buildings:    map[string]float64{"b_solar": 5},
		Research:     map[string]bool{"r_command": true},
		ClickUp:      map[string]float64{},
		RouteUp:      map[string]float64{},
		FiredStories: []string{},
		NextEventAt:  now + 100000,
	}
	s.Meta = MetaState{CoreUp: map[string]float64{}}
	return s
}

func TestValidate_ClampsResourceCheat(t *testing.T) {
	now := 1_800_000_000_000.0
	old := newTestSave("U1", now)

	// 作弊:瞬间暴富
	cheat := Clone(old)
	cheat.Run.Res[ResEnergy] = 1e15
	clean, warns := Validate(old, cheat, 8, now)
	if clean.Run.Res[ResEnergy] >= 1e15 {
		t.Fatal("作弊资源未被钳制")
	}
	if len(warns) == 0 {
		t.Fatal("应有反作弊告警")
	}

	// 正常增量不应被回收
	ok := Clone(old)
	ok.Run.Res[ResEnergy] = old.Run.Res[ResEnergy] + 50
	clean2, warns2 := Validate(old, ok, 8, now)
	if clean2.Run.Res[ResEnergy] <= old.Run.Res[ResEnergy] {
		t.Fatal("正常增量不应被回收")
	}
	for _, w := range warns2 {
		if strings.Contains(w, "energy") {
			t.Fatalf("正常增量误报告警: %v", warns2)
		}
	}
}

func TestValidate_RevertsUnpaidBuilding(t *testing.T) {
	now := 1_800_000_000_000.0
	old := newTestSave("U1", now)

	cheat := Clone(old)
	cheat.Run.Buildings["b_fusion"] = 10 // 10 座聚变堆远超支付能力
	clean, warns := Validate(old, cheat, 8, now)
	if clean.Run.Buildings["b_fusion"] != 0 {
		t.Fatalf("未支付建筑未回退: %v", clean.Run.Buildings)
	}
	found := false
	for _, w := range warns {
		if strings.Contains(w, "b_fusion") {
			found = true
		}
	}
	if !found {
		t.Fatalf("应有建筑回退告警: %v", warns)
	}
}

func TestValidate_RejectsResearchWithoutPrereq(t *testing.T) {
	now := 1_800_000_000_000.0
	old := newTestSave("U1", now)

	cheat := Clone(old)
	cheat.Run.Research["r_engine"] = true // 前置 r_warp 未研究
	clean, warns := Validate(old, cheat, 8, now)
	if clean.Run.Research["r_engine"] {
		t.Fatal("前置不满足的科技未被回退")
	}
	found := false
	for _, w := range warns {
		if strings.Contains(w, "r_engine") {
			found = true
		}
	}
	if !found {
		t.Fatalf("应有科技回退告警: %v", warns)
	}
}

func TestValidate_ClampsCoreAndRuns(t *testing.T) {
	now := 1_800_000_000_000.0
	old := newTestSave("U1", now)

	cheat := Clone(old)
	cheat.Meta.Cores = 1e9 // 星核暴增(轮回数未变)
	cheat.Meta.Runs = 99
	clean, warns := Validate(old, cheat, 8, now)
	if clean.Meta.Cores > 100 {
		t.Fatalf("星核未被钳制: %v", clean.Meta.Cores)
	}
	if clean.Meta.Runs > old.Meta.Runs+5 {
		t.Fatalf("轮回数未被钳制: %v", clean.Meta.Runs)
	}
	if len(warns) == 0 {
		t.Fatal("应有告警")
	}
}

func TestValidate_FirstSaveMigration(t *testing.T) {
	now := 1_800_000_000_000.0
	sv := newTestSave("U1", now)
	clean, _ := Validate(nil, sv, 0, now)
	if clean.Run.DeadlineAt <= clean.Run.StartedAt {
		t.Fatal("首次建档倒计时兜底失败")
	}
}

func TestSanitize_Chronicle(t *testing.T) {
	now := 1_800_000_000_000.0
	s := newTestSave("U1", now)

	route := "swarm"
	badRoute := "unknown"
	hist := make([]RunRecord, 0, 45)
	for i := range 45 {
		rec := RunRecord{
			RunID: i, StartedAt: now - 60000, EndedAt: now, DurationSec: 60,
			Route: &route, Era: 2, ResearchCount: 5, BuildingsTotal: 12,
			EnergyTotal: 12345, Clicks: 40, Cores: 4, RemainSec: 300,
		}
		if i == 0 {
			rec.Route = &badRoute
			rec.EnergyTotal = -5
			rec.Cores = math.NaN()
			rec.Epitaph = strings.Repeat("碑", 500)
		}
		hist = append(hist, rec)
	}
	s.Meta.History = hist

	Sanitize(s)
	if len(s.Meta.History) != MaxHistory {
		t.Fatalf("编年史未截断到 %d: %d", MaxHistory, len(s.Meta.History))
	}
	first := s.Meta.History[0]
	if first.Route != nil {
		t.Fatal("编年史非法路线未清洗")
	}
	if first.EnergyTotal != 0 || first.Cores != 0 {
		t.Fatalf("编年史非法数值未归零: %+v", first)
	}
	if len([]rune(first.Epitaph)) > 120 {
		t.Fatal("铭文未截断")
	}
}
