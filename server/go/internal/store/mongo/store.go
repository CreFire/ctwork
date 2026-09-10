package mongo

import (
	"fmt"
	"os"
	"sync"
)

// Store 抽象，兼容 Memory 与 MongoDB
type Store interface {
	GetTop(limit int) ([]map[string]interface{}, error)
	SubmitRun(entry map[string]interface{}) error
	GetStats() (map[string]interface{}, error)
}

// MemoryStore 内存实现 (开发环境)
type MemoryStore struct {
	mu         sync.RWMutex
	leagueRuns map[string]map[string]interface{}
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		leagueRuns: make(map[string]map[string]interface{}),
	}
}

func (s *MemoryStore) GetTop(limit int) ([]map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// 收集所有
	var all []map[string]interface{}
	for _, v := range s.leagueRuns {
		all = append(all, v)
	}

	// 按 run_score 降序
	// 简化排序，生产环境用 Mongo 索引
	for i := 0; i < len(all); i++ {
		for j := i + 1; j < len(all); j++ {
			si := all[i]["run_score"].(float64)
			sj := all[j]["run_score"].(float64)
			if sj > si {
				all[i], all[j] = all[j], all[i]
			}
		}
	}

	if len(all) > limit {
		all = all[:limit]
	}

	return all, nil
}

func (s *MemoryStore) SubmitRun(entry map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	uid, ok := entry["uid"].(string)
	if !ok || uid == "" {
		return fmt.Errorf("uid required")
	}

	existing, exists := s.leagueRuns[uid]
	if !exists {
		s.leagueRuns[uid] = entry
		return nil
	}

	// 保留最高分
	oldScore := existing["run_score"].(float64)
	newScore := entry["run_score"].(float64)
	if newScore > oldScore {
		s.leagueRuns[uid] = entry
	}

	return nil
}

func (s *MemoryStore) GetStats() (map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]interface{}{
		"leagueEntries": len(s.leagueRuns),
		"type":          "memory",
	}, nil
}

// NewStore 尝试连接 MongoDB，失败则回退内存
func NewStore() (Store, error) {
	mongoURL := os.Getenv("MONGO_URL")
	if mongoURL == "" {
		return nil, fmt.Errorf("MONGO_URL not set, using memory")
	}

	// TODO: 实现真实 MongoDB 连接
	// 当前返回内存实现，预留接口
	return NewMemoryStore(), nil
}
