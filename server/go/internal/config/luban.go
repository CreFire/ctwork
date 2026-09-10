package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Luban 配置结构 (与 TS 生成的 Tables.ts 对齐)
type Meta struct {
	Version     int    `json:"version"`
	GeneratedAt string `json:"generatedAt"`
	Generator   string `json:"generator"`
}

type Global struct {
	EarthCountdownSeconds int     `json:"earth_countdown_seconds"`
	OfflineCapHours       int     `json:"offline_cap_hours"`
	OfflineEfficiency     float64 `json:"offline_efficiency"`
	LaunchEnergyReq       int     `json:"launch_energy_req"`
	LaunchMaterialReq     int     `json:"launch_material_req"`
	RewardProdDivisor     int     `json:"reward_prod_divisor"`
	RewardTimeDivisor     int     `json:"reward_time_divisor"`
	RewardBase            int     `json:"reward_base"`
	MaxOfflineSeconds     int     `json:"max_offline_seconds"`
	TickMs                int     `json:"tick_ms"`
}

type Building struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Chain    string `json:"chain"`
	Scale    float64 `json:"scale"`
	Produces string `json:"produces"`
	PerSec   float64 `json:"perSec"`
}

type Tables struct {
	Meta      Meta       `json:"_meta"`
	Global    Global     `json:"global"`
	Buildings []Building `json:"buildings"`
}

func LoadLubanConfig() (*Tables, error) {
	// 尝试多个路径
	candidates := []string{
		"server/data/tables.json",
		"../../data/tables.json",
		"../data/tables.json",
		"data/tables.json",
	}

	for _, p := range candidates {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(abs); err == nil {
			data, err := os.ReadFile(abs)
			if err != nil {
				continue
			}
			var tables Tables
			if err := json.Unmarshal(data, &tables); err != nil {
				return nil, fmt.Errorf("parse %s: %w", abs, err)
			}
			return &tables, nil
		}
	}

	return nil, fmt.Errorf("tables.json not found in candidates %v", candidates)
}

func FallbackConfig() *Tables {
	return &Tables{
		Meta: Meta{Version: 1},
		Global: Global{
			EarthCountdownSeconds: 3600,
			OfflineCapHours:       8,
			OfflineEfficiency:     0.5,
			LaunchEnergyReq:       250000,
			LaunchMaterialReq:     25000,
			RewardProdDivisor:     1000000,
			RewardTimeDivisor:     600,
			RewardBase:            3,
			MaxOfflineSeconds:     28800,
			TickMs:                250,
		},
		Buildings: []Building{},
	}
}
