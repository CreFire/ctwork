package gate

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ctwork/server/internal/engine"
	"ctwork/server/internal/module"
	"ctwork/server/internal/store"
)

// POST /api/v1/auth/login —— 登录即注册(账号不存在自动创建)
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.lim.allow(clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, "尝试过于频繁,请稍后再试")
		return
	}
	var req struct {
		Account  string `json:"account"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	res, err := s.acc.LoginOrRegister(req.Account, req.Password)
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, module.ErrBadPassword) {
			code = http.StatusUnauthorized
		}
		writeErr(w, code, err.Error())
		return
	}
	writeOK(w, map[string]any{
		"token":     res.Token,
		"uid":       res.UID,
		"account":   res.Account,
		"isNew":     res.IsNew,
		"createdAt": res.CreatedAt,
	})
}

// GET /api/v1/player/profile —— 账号信息
func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request, uid string) {
	p, err := s.acc.Profile(uid)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, http.StatusUnauthorized, "账号不存在")
			return
		}
		writeErr(w, http.StatusInternalServerError, "内部错误")
		return
	}
	writeOK(w, map[string]any{"uid": p.UID, "account": p.Account, "createdAt": p.CreatedAt})
}

// GET /api/v1/player/save —— 拉取整档
func (s *Server) handleGetSave(w http.ResponseWriter, r *http.Request, uid string) {
	rec, err := s.st.GetSave(uid)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusInternalServerError, "读取存档失败")
		return
	}
	var payload json.RawMessage
	var savedAt int64
	if rec != nil {
		payload = json.RawMessage(rec.Payload)
		savedAt = rec.ServerSavedAt
	}
	writeOK(w, map[string]any{"save": payload, "serverSavedAt": savedAt})
}

// POST /api/v1/player/save —— 节流推送 + 服务端权威校验(反作弊 §2.4)
func (s *Server) handlePostSave(w http.ResponseWriter, r *http.Request, uid string) {
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, http.StatusRequestEntityTooLarge, "存档过大")
		return
	}
	sv, err := engine.FromJSON(raw)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "存档格式无法解析")
		return
	}
	if sv.UID != uid {
		writeErr(w, http.StatusForbidden, "存档 UID 与会话不一致")
		return
	}

	nowMs := time.Now().UnixMilli()
	var oldState *engine.SaveState
	var lastSrvMs int64
	if rec, err := s.st.GetSave(uid); err == nil && rec != nil {
		oldState, _ = engine.FromJSON(rec.Payload)
		lastSrvMs = rec.ServerSavedAt
	}
	dtSec := 0.0
	if oldState != nil {
		if lastSrvMs > 0 {
			dtSec = float64(nowMs-lastSrvMs) / 1000 // 服务端权威时钟,免疫改本地时间
		} else {
			dtSec = (float64(nowMs) - oldState.LastTickAt) / 1000
		}
		if dtSec < 0 {
			dtSec = 0
		}
		if dtSec > 48*3600 {
			dtSec = 48 * 3600
		}
	}

	clean, warns := engine.Validate(oldState, sv, dtSec, float64(nowMs))
	payload, err := clean.ToJSON()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "存档序列化失败")
		return
	}
	if err := s.st.PutSave(uid, &store.SaveRecord{Payload: payload, ServerSavedAt: nowMs}); err != nil {
		writeErr(w, http.StatusInternalServerError, "存档写入失败")
		return
	}

	// 排行榜:纪元产能 = 当前 run 累计能量
	if p, err := s.st.GetPlayerByUID(uid); err == nil {
		_ = s.st.UpsertLeague(&store.LeagueEntry{
			UID:      uid,
			Account:  p.Account,
			RunScore: int64(clean.Run.Stats.EnergyTotal),
			RunID:    clean.Run.RunID,
			Escaped:  clean.Meta.Escapes > 0,
			Ts:       nowMs,
		})
	}

	if warns == nil {
		warns = []string{}
	}
	if len(warns) > 0 {
		log.Printf("[anticheat] uid=%s 命中 %d 条告警: %v", uid, len(warns), warns)
	}
	writeOK(w, map[string]any{"ok": true, "warnings": warns})
}

// DELETE /api/v1/player/save —— 清空存档(重新开局)
func (s *Server) handleDeleteSave(w http.ResponseWriter, r *http.Request, uid string) {
	if err := s.st.DeleteSave(uid); err != nil {
		writeErr(w, http.StatusInternalServerError, "删除存档失败")
		return
	}
	writeOK(w, map[string]any{"ok": true})
}

// GET /api/v1/league/top?n=20 —— 产能榜 TopN + 我的名次(可选鉴权)
func (s *Server) handleLeagueTop(w http.ResponseWriter, r *http.Request) {
	n := 20
	if v, err := strconv.Atoi(r.URL.Query().Get("n")); err == nil && v > 0 && v <= 100 {
		n = v
	}
	list, err := s.st.LeagueTop(n)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "排行榜读取失败")
		return
	}
	if list == nil {
		list = []store.LeagueEntry{}
	}
	var me map[string]any
	if uid, ok := s.bearerUID(r); ok {
		if rank, score, err := s.st.LeagueRank(uid); err == nil && rank > 0 {
			me = map[string]any{"rank": rank, "runScore": score}
		}
	}
	writeOK(w, map[string]any{"list": list, "me": me})
}

// GET /healthz
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeOK(w, map[string]any{"ok": true, "service": "ark-era-duegate", "version": engine.Version})
}

// GET / —— 前端静态托管(SPA 回退 index.html;API 路径除外)
func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if s.webDir == "" || strings.HasPrefix(r.URL.Path, "/api/") {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p := filepath.Join(s.webDir, filepath.Clean("/"+r.URL.Path))
	if st, err := os.Stat(p); err == nil && !st.IsDir() {
		http.ServeFile(w, r, p)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.webDir, "index.html"))
}
