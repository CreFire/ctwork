package league

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"

	"ark-era/server/go/internal/config"
	"ark-era/server/go/internal/store/mongo"
)

// Entry 排行榜条目，对应 league_run 集合
type Entry struct {
	UID           string `json:"uid" bson:"uid"`
	Account       string `json:"account" bson:"account"`
	RunScore      int    `json:"run_score" bson:"run_score"`
	Escaped       bool   `json:"escaped" bson:"escaped"`
	RunID         int    `json:"run_id" bson:"run_id"`
	Route         string `json:"route" bson:"route"`
	Cores         int    `json:"cores" bson:"cores"`
	TotalEnergy   float64 `json:"totalEnergy" bson:"total_energy"`
	BestRemainSec float64 `json:"bestRemainSec" bson:"best_remain_sec"`
	TS            int64  `json:"ts" bson:"ts"`
	Rank          int    `json:"rank,omitempty" bson:"-"`
}

type Module struct {
	store mongo.Store
	cfg   *config.Tables
	mu    sync.RWMutex
	// 内存缓存，用于快速 Top 查询 (生产环境用 Mongo 索引)
	cache []Entry
}

func NewModule(store mongo.Store, cfg *config.Tables) *Module {
	m := &Module{
		store: store,
		cfg:   cfg,
	}
	// 定时刷新缓存
	go m.refreshLoop()
	return m
}

func (m *Module) refreshLoop() {
	ticker := time.NewTicker(10 * time.Second)
	for range ticker.C {
		m.refreshCache()
	}
}

func (m *Module) refreshCache() {
	entries, err := m.store.GetTop(1000)
	if err != nil {
		return
	}
	// 转换为 Entry
	var list []Entry
	for _, e := range entries {
		list = append(list, Entry{
			UID:           e["uid"].(string),
			Account:       e["account"].(string),
			RunScore:      int(e["run_score"].(float64)),
			Escaped:       e["escaped"].(bool),
			RunID:         int(e["run_id"].(float64)),
			Route:         e["route"].(string),
			Cores:         int(e["cores"].(float64)),
			TS:            int64(e["ts"].(float64)),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].RunScore > list[j].RunScore
	})
	for i := range list {
		list[i].Rank = i + 1
	}
	m.mu.Lock()
	m.cache = list
	m.mu.Unlock()
}

// HandleTop GET /api/v1/league/top?limit=100&uid=xxx
func (m *Module) HandleTop(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			if l > 0 && l <= 200 {
				limit = l
			}
		}
	}
	uid := r.URL.Query().Get("uid")

	m.mu.RLock()
	cache := m.cache
	m.mu.RUnlock()

	if cache == nil {
		// 首次请求，直接从 store 读取
		entries, _ := m.store.GetTop(limit)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"top":   entries,
			"total": len(entries),
			"ts":    time.Now().UnixMilli(),
		})
		return
	}

	top := cache
	if len(top) > limit {
		top = top[:limit]
	}

	// 查找我的排名
	var myRank *Entry
	var myRankNum *int
	if uid != "" {
		for _, e := range cache {
			if e.UID == uid {
				c := e
				myRank = &c
				r := c.Rank
				myRankNum = &r
				break
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"top":          top,
		"myRank":       myRank,
		"myRankNumber": myRankNum,
		"total":        len(cache),
		"limit":        limit,
		"ts":           time.Now().UnixMilli(),
	})
}

// HandleSubmit POST /api/v1/league/submit
func (m *Module) HandleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		UID         string  `json:"uid"`
		Account     string  `json:"account"`
		RunScore    int     `json:"run_score"`
		Escaped     bool    `json:"escaped"`
		RunID       int     `json:"run_id"`
		Route       string  `json:"route"`
		Cores       int     `json:"cores"`
		TotalEnergy float64 `json:"totalEnergy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 反作弊校验
	if req.RunScore < 0 || req.RunScore > 1e12 {
		http.Error(w, "Invalid run_score", http.StatusBadRequest)
		return
	}

	entry := map[string]interface{}{
		"uid":         req.UID,
		"account":     req.Account,
		"run_score":   float64(req.RunScore),
		"escaped":     req.Escaped,
		"run_id":      float64(req.RunID),
		"route":       req.Route,
		"cores":       float64(req.Cores),
		"totalEnergy": req.TotalEnergy,
		"ts":          float64(time.Now().UnixMilli()),
	}

	if err := m.store.SubmitRun(entry); err != nil {
		http.Error(w, "Failed to submit: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 刷新缓存
	go m.refreshCache()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":    true,
		"entry": entry,
	})
}

func (m *Module) HandleStats(w http.ResponseWriter, r *http.Request) {
	m.mu.RLock()
	total := len(m.cache)
	m.mu.RUnlock()

	stats, _ := m.store.GetStats()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalPlayers": total,
		"store":        stats,
		"ts":           time.Now().UnixMilli(),
	})
}
