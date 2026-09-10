// 方舟纪元 ARK ERA — dueGame v0.1 服务端入口
// 单进程网关:HTTP 五接口 + 前端静态托管;存储:文件(默认)/ MongoDB(ARK_MONGO_URI)。
//
// 环境变量:
//   ARK_ADDR        监听地址(默认 :8090)
//   ARK_DATA_DIR    文件存储目录(默认 server/data)
//   ARK_WEB_DIST    前端 dist 目录(默认 dist;空字符串关闭静态托管)
//   ARK_MONGO_URI   MongoDB 连接串(设置后启用 MongoDB 存储)
//   ARK_MONGO_DB    MongoDB 库名(默认 ark_era)
//   ARK_JWT_SECRET  JWT 密钥(默认自动生成并持久化到 <data>/jwt.secret)
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"ctwork/server/internal/gate"
	"ctwork/server/internal/store"
	"ctwork/server/internal/store/filestore"
	"ctwork/server/internal/store/mongostore"
)

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// loadOrCreateSecret JWT 密钥:优先环境变量,否则生成随机密钥并持久化
func loadOrCreateSecret(dataDir string) ([]byte, error) {
	if v := strings.TrimSpace(os.Getenv("ARK_JWT_SECRET")); v != "" && len(v) >= 16 {
		return []byte(v), nil
	}
	path := filepath.Join(dataDir, "jwt.secret")
	if b, err := os.ReadFile(path); err == nil && len(strings.TrimSpace(string(b))) >= 16 {
		return []byte(strings.TrimSpace(string(b))), nil
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	secret := []byte(hex.EncodeToString(buf))
	if err := os.WriteFile(path, secret, 0o600); err != nil {
		return nil, err
	}
	log.Printf("[auth] 已生成新 JWT 密钥 → %s", path)
	return secret, nil
}

func main() {
	addr := envOr("ARK_ADDR", ":8090")
	dataDir := envOr("ARK_DATA_DIR", "server/data")
	webDir := envOr("ARK_WEB_DIST", "dist")
	mongoURI := strings.TrimSpace(os.Getenv("ARK_MONGO_URI"))
	mongoDB := envOr("ARK_MONGO_DB", "ark_era")

	// —— 存储层 ——
	var st store.Store
	if mongoURI != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		ms, err := mongostore.New(ctx, mongoURI, mongoDB)
		cancel()
		if err != nil {
			log.Fatalf("[store] MongoDB 连接失败: %v", err)
		}
		st = ms
		log.Printf("[store] MongoDB: %s (db=%s)", mongoURI, mongoDB)
	} else {
		fs, err := filestore.New(dataDir)
		if err != nil {
			log.Fatalf("[store] 初始化文件存储失败: %v", err)
		}
		st = fs
		log.Printf("[store] 本地文件存储: %s", dataDir)
	}
	defer st.Close()

	// —— 密钥 ——
	secret, err := loadOrCreateSecret(dataDir)
	if err != nil {
		log.Fatalf("[auth] JWT 密钥初始化失败: %v", err)
	}

	// —— 网关 ——
	srv := gate.New(gate.Config{Addr: addr, WebDir: webDir, Secret: secret, Store: st})

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Println("[gate] 收到退出信号,正在关闭…")
		_ = srv.Close()
	}()

	log.Printf("[gate] dueGame v0.1 网关已启动: http://0.0.0.0%s (web=%s, api=/api/v1/*)", addr, webDir)
	if err := srv.Run(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[gate] 服务退出: %v", err)
	}
	log.Println("[gate] 已退出")
}
