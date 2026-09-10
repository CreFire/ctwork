// Package filestore 基于本地 JSON 文件的存储实现(开发/单机默认)。
// 目录结构:
//   <dir>/players.json            账号表(小写账号 → Player)
//   <dir>/saves/<uid>.json        每玩家整档(SaveRecord)
//   <dir>/league.json             产能榜(UID → LeagueEntry)
package filestore

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"ctwork/server/internal/store"
)

type FileStore struct {
	dir string
	mu  sync.Mutex
}

func New(dir string) (*FileStore, error) {
	if err := os.MkdirAll(filepath.Join(dir, "saves"), 0o755); err != nil {
		return nil, err
	}
	return &FileStore{dir: dir}, nil
}

// —— 通用原子写 ——

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return store.ErrNotFound
		}
		return err
	}
	return json.Unmarshal(b, v)
}

// —— players ——
// playerDTO 持久化格式:不能用 store.Player 直接序列化(其 PassHash 带 json:"-" 防泄露)
type playerDTO struct {
	UID       string `json:"uid"`
	Account   string `json:"account"`
	PassHash  string `json:"passHash"`
	CreatedAt int64  `json:"createdAt"`
}

func toDTO(p *store.Player) *playerDTO {
	return &playerDTO{UID: p.UID, Account: p.Account, PassHash: p.PassHash, CreatedAt: p.CreatedAt}
}

func fromDTO(d *playerDTO) *store.Player {
	return &store.Player{UID: d.UID, Account: d.Account, PassHash: d.PassHash, CreatedAt: d.CreatedAt}
}

func (f *FileStore) playersPath() string { return filepath.Join(f.dir, "players.json") }

func (f *FileStore) loadPlayers() (map[string]*store.Player, error) {
	m := map[string]*playerDTO{}
	if err := readJSON(f.playersPath(), &m); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return map[string]*store.Player{}, nil
		}
		return nil, err
	}
	out := make(map[string]*store.Player, len(m))
	for k, v := range m {
		out[k] = fromDTO(v)
	}
	return out, nil
}

func (f *FileStore) savePlayers(m map[string]*store.Player) error {
	d := make(map[string]*playerDTO, len(m))
	for k, v := range m {
		d[k] = toDTO(v)
	}
	b, err := json.Marshal(d)
	if err != nil {
		return err
	}
	return atomicWrite(f.playersPath(), b)
}

func (f *FileStore) CreatePlayer(p *store.Player) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadPlayers()
	if err != nil {
		return err
	}
	key := strings.ToLower(p.Account)
	if _, ok := m[key]; ok {
		return store.ErrDuplicate
	}
	m[key] = p
	return f.savePlayers(m)
}

func (f *FileStore) GetPlayerByAccount(accountLower string) (*store.Player, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadPlayers()
	if err != nil {
		return nil, err
	}
	p, ok := m[accountLower]
	if !ok {
		return nil, store.ErrNotFound
	}
	return p, nil
}

func (f *FileStore) GetPlayerByUID(uid string) (*store.Player, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadPlayers()
	if err != nil {
		return nil, err
	}
	for _, p := range m {
		if p.UID == uid {
			return p, nil
		}
	}
	return nil, store.ErrNotFound
}

// —— saves ——

func (f *FileStore) savePath(uid string) string {
	return filepath.Join(f.dir, "saves", uid+".json")
}

func (f *FileStore) GetSave(uid string) (*store.SaveRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !validUID(uid) {
		return nil, store.ErrNotFound
	}
	var rec store.SaveRecord
	if err := readJSON(f.savePath(uid), &rec); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, err
	}
	return &rec, nil
}

func (f *FileStore) PutSave(uid string, rec *store.SaveRecord) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !validUID(uid) {
		return errors.New("filestore: invalid uid")
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return atomicWrite(f.savePath(uid), b)
}

func (f *FileStore) DeleteSave(uid string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !validUID(uid) {
		return nil
	}
	err := os.Remove(f.savePath(uid))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// —— league ——

func (f *FileStore) leaguePath() string { return filepath.Join(f.dir, "league.json") }

func (f *FileStore) loadLeague() (map[string]*store.LeagueEntry, error) {
	m := map[string]*store.LeagueEntry{}
	if err := readJSON(f.leaguePath(), &m); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return m, nil
		}
		return nil, err
	}
	return m, nil
}

func (f *FileStore) UpsertLeague(e *store.LeagueEntry) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadLeague()
	if err != nil {
		return err
	}
	cur, ok := m[e.UID]
	if !ok || e.RunScore > cur.RunScore || (e.RunScore == cur.RunScore && e.Ts > cur.Ts) {
		m[e.UID] = e
		b, err := json.Marshal(m)
		if err != nil {
			return err
		}
		return atomicWrite(f.leaguePath(), b)
	}
	return nil
}

func (f *FileStore) LeagueTop(n int) ([]store.LeagueEntry, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadLeague()
	if err != nil {
		return nil, err
	}
	list := make([]store.LeagueEntry, 0, len(m))
	for _, e := range m {
		list = append(list, *e)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].RunScore != list[j].RunScore {
			return list[i].RunScore > list[j].RunScore
		}
		return list[i].Ts < list[j].Ts
	})
	if n > 0 && len(list) > n {
		list = list[:n]
	}
	return list, nil
}

func (f *FileStore) LeagueRank(uid string) (int64, int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, err := f.loadLeague()
	if err != nil {
		return 0, 0, err
	}
	me, ok := m[uid]
	if !ok {
		return 0, 0, nil
	}
	var rank int64 = 1
	for _, e := range m {
		if e.UID != uid && e.RunScore > me.RunScore {
			rank++
		}
	}
	return rank, me.RunScore, nil
}

func (f *FileStore) Close() error { return nil }

// validUID 防路径穿越:UID 仅允许字母数字
func validUID(uid string) bool {
	if uid == "" || len(uid) > 32 {
		return false
	}
	for _, r := range uid {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
			return false
		}
	}
	_ = time.Now // 保持 time 引用(未来扩展用)
	return true
}
