// Package store 定义服务端存储层接口。
// v0.1 提供两种实现:filestore(本地 JSON 文件,默认/开发)与 mongostore(生产)。
// 集合设计见 docs/ARCHITECTURE.md §2.2。
package store

import "errors"

var (
	ErrNotFound   = errors.New("store: not found")
	ErrDuplicate  = errors.New("store: duplicate")
	ErrMaxScore   = errors.New("store: lower score") // UpsertLeague 中榜分更低时静默忽略
)

// Player players 集合:账号(唯一)+ bcrypt 口径的口令散列 + 绑定 UID
type Player struct {
	UID       string `json:"uid" bson:"uid"`
	Account   string `json:"account" bson:"account"`     // 原始大小写
	PassHash  string `json:"-" bson:"passHash"`          // bcrypt
	CreatedAt int64  `json:"createdAt" bson:"createdAt"` // ms
}

// SaveRecord saves 集合:整档 JSON + 服务端接收时刻(权威时钟,反作弊用)
type SaveRecord struct {
	Payload       []byte `json:"payload" bson:"payload"`
	ServerSavedAt int64  `json:"serverSavedAt" bson:"serverSavedAt"` // ms
}

// LeagueEntry league_run 集合:纪元产能榜(每 UID 保留最高分)
type LeagueEntry struct {
	UID      string `json:"uid" bson:"uid"`
	Account  string `json:"account" bson:"account"`
	RunScore int64  `json:"runScore" bson:"runScore"` // 纪元产能(当前 run 累计能量)
	RunID    int    `json:"runId" bson:"runId"`
	Escaped  bool   `json:"escaped" bson:"escaped"`
	Ts       int64  `json:"ts" bson:"ts"`
}

type Store interface {
	// —— players ——
	CreatePlayer(p *Player) error                          // 账号已存在 → ErrDuplicate
	GetPlayerByAccount(accountLower string) (*Player, error) // ErrNotFound
	GetPlayerByUID(uid string) (*Player, error)              // ErrNotFound

	// —— saves ——
	GetSave(uid string) (*SaveRecord, error) // ErrNotFound
	PutSave(uid string, rec *SaveRecord) error
	DeleteSave(uid string) error

	// —— league_run ——
	UpsertLeague(e *LeagueEntry) error // 每 UID 保留 runScore 更高者
	LeagueTop(n int) ([]LeagueEntry, error)
	LeagueRank(uid string) (rank int64, score int64, err error) // 无记录 → rank=0

	Close() error
}
