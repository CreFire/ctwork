// Package gate dueGame 风格 HTTP 网关(v0.1 短连接):
// 接入 / JWT 鉴权 / 登录限流 / CORS / 前端静态托管。
// v0.2 将按 docs/ARCHITECTURE.md §2.3 升级为 due WebSocket 长连接。
package gate

import (
	"net/http"
	"time"

	"ctwork/server/internal/module"
	"ctwork/server/internal/store"
)

type Config struct {
	Addr   string
	WebDir string // 前端构建产物目录(dist);为空则仅提供 API
	Secret []byte // JWT 签名密钥
	Store  store.Store
}

type Server struct {
	addr   string
	st     store.Store
	acc    *module.Account
	secret []byte
	webDir string
	lim    *rateLimiter
	mux    *http.ServeMux
	srv    *http.Server
}

func New(cfg Config) *Server {
	s := &Server{
		addr:   cfg.Addr,
		st:     cfg.Store,
		acc:    module.NewAccount(cfg.Store, cfg.Secret),
		secret: cfg.Secret,
		webDir: cfg.WebDir,
		lim:    newRateLimiter(),
		mux:    http.NewServeMux(),
	}

	// —— v0.1 协议(docs/ARCHITECTURE.md §2.3) ——
	s.mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	s.mux.HandleFunc("GET /api/v1/player/profile", s.withAuth(s.handleProfile))
	s.mux.HandleFunc("GET /api/v1/player/save", s.withAuth(s.handleGetSave))
	s.mux.HandleFunc("POST /api/v1/player/save", s.withAuth(s.handlePostSave))
	s.mux.HandleFunc("DELETE /api/v1/player/save", s.withAuth(s.handleDeleteSave))
	// 排行榜(可选鉴权:带 token 附加返回我的名次)
	s.mux.HandleFunc("GET /api/v1/league/top", s.handleLeagueTop)
	// 运维
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	// 前端静态托管(SPA 回退)
	s.mux.HandleFunc("/", s.handleStatic)
	return s
}

func (s *Server) Handler() http.Handler {
	return s.withLogging(s.withCORS(s.mux))
}

// Run 启动 HTTP 服务(阻塞)
func (s *Server) Run() error {
	s.srv = &http.Server{
		Addr:              s.addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s.srv.ListenAndServe()
}

// Close 优雅关闭
func (s *Server) Close() error {
	if s.srv == nil {
		return nil
	}
	ctx, cancel := contextWithTimeout(5 * time.Second)
	defer cancel()
	return s.srv.Shutdown(ctx)
}
