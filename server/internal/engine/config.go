/**
 * ============================================================
 * 方舟纪元 ARK ERA — 服务端权威数值表
 * ============================================================
 * 与前端 src/game/config.ts(Luban 表手写等价版)逐字段对齐。
 * 正式接入 Luban 后,本文件由 tb_* 表导出的 Go bean 直接替换。
 * ============================================================
 */
package engine

// 资源 key(与前端 ResourceKey 一致)
const (
	ResEnergy   = "energy"
	ResMaterial = "material"
	ResResearch = "research"
	ResSpecial  = "special"
)

// ResKeys 与前端 RES_KEYS 顺序一致("all" 乘区按此顺序累乘,保证双端浮点一致)
var ResKeys = [4]string{ResEnergy, ResMaterial, ResResearch, ResSpecial}

// —— tb_global 全局常量 ——
const (
	Version               = 1
	EarthCountdownSeconds = 3600.0 // 地球解体倒计时(每轮,秒)
	OfflineCapHours       = 8.0    // 离线收益上限(小时)
	OfflineEfficiency     = 0.5    // 离线效率
	ClickBasePower        = 1.0    // 基础点击产出
	CritMult              = 5.0    // 暴击倍率
	MilestoneEvery        = 25     // 每拥有 N 座同建筑
	MilestoneMult         = 2.0    // 产出 ×2
	LaunchEnergyReq       = 250000.0
	LaunchMaterialReq     = 25000.0
	RewardBase            = 3.0 // 逃生保底星核
)

// Cost 资源成本(与前端 Cost 接口一致)
type Cost struct {
	Energy   float64 `json:"energy,omitempty"`
	Material float64 `json:"material,omitempty"`
	Research float64 `json:"research,omitempty"`
	Special  float64 `json:"special,omitempty"`
}

// EffectKind 效果类型枚举
type EffectKind uint8

const (
	EffMult        EffectKind = iota // 产出乘区 ×V
	EffClickMult                     // 点击倍率 ×V
	EffAutoClick                     // 自动点击 +V 次/秒
	EffCrit                          // 暴击率 +V
	EffCountdown                     // 倒计时 +V 秒
	EffEnableRoute                   // 解锁科技路线
	EffStartKit                      // 开局补给
)

// Effect 数值效果
type Effect struct {
	K     EffectKind
	Res   string  // mult: 作用资源 / "all"
	V     float64 //
	Route string  // enableRoute: 路线 id
}

func Mult(res string, v float64) Effect { return Effect{K: EffMult, Res: res, V: v} }

// —— tb_building 建筑表 ——
type BuildingDef struct {
	ID             string
	BaseCost       Cost
	Scale          float64
	Produces       string
	PerSec         float64
	UnlockResearch string
	UnlockRoute    string
}

var Buildings = []BuildingDef{
	// —— 能源链 ——
	{ID: "b_solar", BaseCost: Cost{Energy: 15}, Scale: 1.15, Produces: ResEnergy, PerSec: 0.5},
	{ID: "b_fossil", BaseCost: Cost{Energy: 110, Material: 12}, Scale: 1.15, Produces: ResEnergy, PerSec: 3},
	{ID: "b_fission", BaseCost: Cost{Energy: 2400, Material: 120}, Scale: 1.16, Produces: ResEnergy, PerSec: 16, UnlockResearch: "r_nuclear"},
	{ID: "b_fusion", BaseCost: Cost{Energy: 36000, Material: 900}, Scale: 1.17, Produces: ResEnergy, PerSec: 120, UnlockResearch: "r_fusion"},
	{ID: "b_antimatter", BaseCost: Cost{Energy: 520000, Material: 7000}, Scale: 1.18, Produces: ResEnergy, PerSec: 950, UnlockResearch: "r_antimatter"},
	{ID: "b_zero", BaseCost: Cost{Energy: 6500000, Material: 55000}, Scale: 1.18, Produces: ResEnergy, PerSec: 8000, UnlockResearch: "r_vacuum"},
	// —— 物资链 ——
	{ID: "b_scavenge", BaseCost: Cost{Energy: 40}, Scale: 1.15, Produces: ResMaterial, PerSec: 0.5},
	{ID: "b_mine", BaseCost: Cost{Energy: 1800, Material: 100}, Scale: 1.16, Produces: ResMaterial, PerSec: 5, UnlockResearch: "r_nano"},
	{ID: "b_smelter", BaseCost: Cost{Energy: 30000, Material: 800}, Scale: 1.17, Produces: ResMaterial, PerSec: 42, UnlockResearch: "r_orbital"},
	{ID: "b_molecular", BaseCost: Cost{Energy: 480000, Material: 9000}, Scale: 1.18, Produces: ResMaterial, PerSec: 360, UnlockResearch: "r_molecular"},
	// —— 科研链 ——
	{ID: "b_study", BaseCost: Cost{Material: 60}, Scale: 1.15, Produces: ResResearch, PerSec: 0.3},
	{ID: "b_lab", BaseCost: Cost{Material: 700, Energy: 2000}, Scale: 1.16, Produces: ResResearch, PerSec: 2.2, UnlockResearch: "r_automation"},
	{ID: "b_quantum", BaseCost: Cost{Material: 8500, Energy: 30000}, Scale: 1.17, Produces: ResResearch, PerSec: 16, UnlockResearch: "r_ai"},
	// —— 路线专属 ——
	{ID: "b_datacore", BaseCost: Cost{Energy: 20000, Material: 3000}, Scale: 1.16, Produces: ResSpecial, PerSec: 1.2, UnlockRoute: "machine"},
	{ID: "b_spire", BaseCost: Cost{Energy: 20000, Material: 3000}, Scale: 1.16, Produces: ResSpecial, PerSec: 1.2, UnlockRoute: "swarm"},
	{ID: "b_monolith", BaseCost: Cost{Energy: 20000, Material: 3000}, Scale: 1.16, Produces: ResSpecial, PerSec: 1.2, UnlockRoute: "psionic"},
}

// —— tb_click 点击升级表 ——
type ClickUpgradeDef struct {
	ID       string
	BaseCost float64
	Scale    float64
	Max      int
	Eff      Effect // K ∈ {clickMult, autoClick, crit}
}

var ClickUpgrades = []ClickUpgradeDef{
	{ID: "u_click", BaseCost: 40, Scale: 3.1, Max: 25, Eff: Effect{K: EffClickMult, V: 2}},
	{ID: "u_auto", BaseCost: 180, Scale: 3.4, Max: 20, Eff: Effect{K: EffAutoClick, V: 1}},
	{ID: "u_crit", BaseCost: 900, Scale: 4, Max: 10, Eff: Effect{K: EffCrit, V: 0.04}},
}

// —— tb_research 科技树(服务端只需 cost/req/数值效果) ——
type ResearchDef struct {
	ID      string
	Cost    Cost
	Req     []string
	Effects []Effect
}

var Research = []ResearchDef{
	// Era 0
	{ID: "r_command", Cost: Cost{Research: 6}, Req: []string{}, Effects: []Effect{Mult("all", 1.2)}},
	{ID: "r_survival", Cost: Cost{Research: 25, Material: 40}, Req: []string{"r_command"}, Effects: []Effect{Mult(ResMaterial, 1.6)}},
	// Era 1
	{ID: "r_solar2", Cost: Cost{Research: 50}, Req: []string{"r_command"}, Effects: []Effect{Mult(ResEnergy, 1.5)}},
	{ID: "r_nuclear", Cost: Cost{Research: 130, Material: 150}, Req: []string{"r_survival", "r_solar2"}, Effects: []Effect{Mult(ResEnergy, 1.2)}},
	{ID: "r_automation", Cost: Cost{Research: 220, Material: 260}, Req: []string{"r_survival"}, Effects: []Effect{Mult(ResResearch, 1.3)}},
	// Era 2
	{ID: "r_nano", Cost: Cost{Research: 520, Material: 700}, Req: []string{"r_automation"}, Effects: nil},
	{ID: "r_orbital", Cost: Cost{Research: 950, Material: 1400}, Req: []string{"r_nano"}, Effects: []Effect{Mult(ResMaterial, 1.5)}},
	{ID: "r_ai", Cost: Cost{Research: 1700, Material: 2200}, Req: []string{"r_automation", "r_nuclear"}, Effects: []Effect{Mult(ResResearch, 2), {K: EffEnableRoute, Route: "machine"}}},
	// Era 3
	{ID: "r_gene", Cost: Cost{Research: 3200, Material: 4000}, Req: []string{"r_ai"}, Effects: []Effect{{K: EffEnableRoute, Route: "swarm"}}},
	{ID: "r_psy", Cost: Cost{Research: 3400, Material: 4200}, Req: []string{"r_ai"}, Effects: []Effect{{K: EffEnableRoute, Route: "psionic"}}},
	{ID: "r_fusion", Cost: Cost{Research: 2600, Material: 3000}, Req: []string{"r_orbital"}, Effects: []Effect{Mult(ResEnergy, 2)}},
	// Era 4
	{ID: "r_antimatter", Cost: Cost{Research: 12000, Material: 14000}, Req: []string{"r_fusion"}, Effects: []Effect{Mult("all", 1.3)}},
	{ID: "r_molecular", Cost: Cost{Research: 21000, Material: 24000}, Req: []string{"r_antimatter"}, Effects: []Effect{Mult(ResMaterial, 2)}},
	{ID: "r_warp", Cost: Cost{Research: 55000, Material: 70000}, Req: []string{"r_antimatter"}, Effects: nil},
	// Era 5
	{ID: "r_vacuum", Cost: Cost{Research: 120000, Material: 150000}, Req: []string{"r_molecular"}, Effects: []Effect{Mult(ResEnergy, 2)}},
	{ID: "r_engine", Cost: Cost{Research: 90000, Material: 110000}, Req: []string{"r_warp"}, Effects: nil},
}

// —— tb_route_upgrade 路线升级表 ——
type RouteUpgradeDef struct {
	ID       string
	Route    string
	Max      int
	BaseCost float64 // 特殊资源
	Scale    float64
	Eff      Effect
}

var RouteUpgrades = []RouteUpgradeDef{
	// machine
	{ID: "ru_m_furnace", Route: "machine", Max: 10, BaseCost: 30, Scale: 1.75, Eff: Mult(ResEnergy, 1.35)},
	{ID: "ru_m_net", Route: "machine", Max: 10, BaseCost: 40, Scale: 1.8, Eff: Mult(ResResearch, 1.4)},
	{ID: "ru_m_drone", Route: "machine", Max: 10, BaseCost: 55, Scale: 1.9, Eff: Effect{K: EffAutoClick, V: 3}},
	{ID: "ru_m_alloy", Route: "machine", Max: 10, BaseCost: 40, Scale: 1.8, Eff: Mult(ResMaterial, 1.35)},
	// swarm
	{ID: "ru_s_breed", Route: "swarm", Max: 10, BaseCost: 45, Scale: 1.85, Eff: Mult("all", 1.2)},
	{ID: "ru_s_hive", Route: "swarm", Max: 10, BaseCost: 40, Scale: 1.8, Eff: Mult(ResResearch, 1.45)},
	{ID: "ru_s_acid", Route: "swarm", Max: 10, BaseCost: 35, Scale: 1.75, Eff: Mult(ResMaterial, 1.5)},
	{ID: "ru_s_tide", Route: "swarm", Max: 10, BaseCost: 50, Scale: 1.9, Eff: Effect{K: EffClickMult, V: 1.6}},
	// psionic
	{ID: "ru_p_seer", Route: "psionic", Max: 10, BaseCost: 35, Scale: 1.8, Eff: Effect{K: EffCrit, V: 0.05}},
	{ID: "ru_p_void", Route: "psionic", Max: 10, BaseCost: 40, Scale: 1.8, Eff: Mult(ResEnergy, 1.45)},
	{ID: "ru_p_mind", Route: "psionic", Max: 10, BaseCost: 40, Scale: 1.8, Eff: Mult(ResResearch, 1.4)},
	{ID: "ru_p_warp", Route: "psionic", Max: 10, BaseCost: 55, Scale: 1.9, Eff: Mult("all", 1.22)},
}

// —— tb_core 星核遗产表(跨轮回) ——
type CoreUpgradeDef struct {
	ID   string
	Max  int
	Base float64
	Inc  float64
	Eff  Effect
}

var CoreUpgrades = []CoreUpgradeDef{
	{ID: "cu_ember", Max: 20, Base: 6, Inc: 4, Eff: Mult(ResEnergy, 1.3)},
	{ID: "cu_forge", Max: 20, Base: 6, Inc: 4, Eff: Mult(ResMaterial, 1.3)},
	{ID: "cu_palace", Max: 20, Base: 6, Inc: 4, Eff: Mult(ResResearch, 1.25)},
	{ID: "cu_anchor", Max: 10, Base: 8, Inc: 6, Eff: Effect{K: EffCountdown, V: 600}},
	{ID: "cu_seeder", Max: 15, Base: 4, Inc: 3, Eff: Effect{K: EffStartKit, V: 1}},
}

// —— 查表 ——
var (
	buildingMap  = map[string]*BuildingDef{}
	researchMap  = map[string]*ResearchDef{}
	clickMap     = map[string]*ClickUpgradeDef{}
	routeUpMap   = map[string]*RouteUpgradeDef{}
	coreUpMap    = map[string]*CoreUpgradeDef{}
)

func init() {
	for i := range Buildings {
		buildingMap[Buildings[i].ID] = &Buildings[i]
	}
	for i := range Research {
		researchMap[Research[i].ID] = &Research[i]
	}
	for i := range ClickUpgrades {
		clickMap[ClickUpgrades[i].ID] = &ClickUpgrades[i]
	}
	for i := range RouteUpgrades {
		routeUpMap[RouteUpgrades[i].ID] = &RouteUpgrades[i]
	}
	for i := range CoreUpgrades {
		coreUpMap[CoreUpgrades[i].ID] = &CoreUpgrades[i]
	}
}

func BuildingOf(id string) *BuildingDef         { return buildingMap[id] }
func ResearchOf(id string) *ResearchDef         { return researchMap[id] }
func ClickUpgradeOf(id string) *ClickUpgradeDef { return clickMap[id] }
func RouteUpgradeOf(id string) *RouteUpgradeDef { return routeUpMap[id] }
func CoreUpgradeOf(id string) *CoreUpgradeDef   { return coreUpMap[id] }
