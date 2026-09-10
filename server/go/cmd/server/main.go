package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"ark-era/server/go/internal/config"
	"ark-era/server/go/internal/module/league"
	"ark-era/server/go/internal/store/mongo"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	// 加载 Luban 配置
	cfg, err := config.LoadLubanConfig()
	if err != nil {
		log.Printf("[WARN] Failed to load Luban config: %v, using fallback", err)
		cfg = config.FallbackConfig()
	}
	log.Printf("[Luban] Loaded config v%d with %d buildings", cfg.Meta.Version, len(cfg.Buildings))

	// 初始化存储 (MongoDB 或内存)
	store, err := mongo.NewStore()
	if err != nil {
		log.Printf("[WARN] MongoDB not available: %v, using memory store", err)
		store = mongo.NewMemoryStore()
	}

	// 初始化排行榜模块 (LeagueActor)
	leagueModule := league.NewModule(store, cfg)

	// HTTP 路由 (Gate 节点)
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"service":"ark-era-league-go","version":"0.2.0","lubanVersion":%d}`, cfg.Meta.Version)
	})

	mux.HandleFunc("/api/v1/league/top", leagueModule.HandleTop)
	mux.HandleFunc("/api/v1/league/submit", leagueModule.HandleSubmit)
	mux.HandleFunc("/api/v1/league/stats", leagueModule.HandleStats)

	log.Printf("[Server] Go backend listening on :%s", port)
	log.Printf("[Server] Health: http://localhost:%s/health", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("[Server] Failed: %v", err)
	}
}
