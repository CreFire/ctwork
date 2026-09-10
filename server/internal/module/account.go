// Package module 账号与鉴权:登录即注册、uid 绑定、JWT 签发/校验。
// 协议:POST /api/v1/auth/login(docs/ARCHITECTURE.md §2.3)。
package module

import (
	"errors"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"ctwork/server/internal/store"
)

const (
	MinAccountLen = 3
	MinPassLen    = 4
	tokenTTL      = 30 * 24 * time.Hour
	bcryptCost    = 10
)

var (
	ErrEmpty       = errors.New("请输入账号与密码")
	ErrAccountLen  = errors.New("账号至少 3 个字符")
	ErrPasswordLen = errors.New("密码至少 4 位")
	ErrBadPassword = errors.New("密码错误:该账号已存在,请输入正确的密码")
)

type Account struct {
	st     store.Store
	secret []byte
}

func NewAccount(st store.Store, secret []byte) *Account {
	return &Account{st: st, secret: secret}
}

// AuthResult 与前端 AuthResult 接口一致
type AuthResult struct {
	Token     string `json:"token"`
	UID       string `json:"uid"`
	Account   string `json:"account"`
	IsNew     bool   `json:"isNew"`
	CreatedAt int64  `json:"createdAt"`
}

// LoginOrRegister 登录即注册:账号不存在自动创建,一个账号绑定一个 UID。
func (a *Account) LoginOrRegister(account, password string) (*AuthResult, error) {
	account = strings.TrimSpace(account)
	if account == "" || password == "" {
		return nil, ErrEmpty
	}
	if len([]rune(account)) < MinAccountLen {
		return nil, ErrAccountLen
	}
	if len(password) < MinPassLen {
		return nil, ErrPasswordLen
	}

	key := strings.ToLower(account)
	p, err := a.st.GetPlayerByAccount(key)
	isNew := false
	switch {
	case err == nil:
		// 已有账号:校验密码
		if bcrypt.CompareHashAndPassword([]byte(p.PassHash), []byte(password)) != nil {
			return nil, ErrBadPassword
		}
	case errors.Is(err, store.ErrNotFound):
		// 自动注册
		isNew = true
		hash, herr := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
		if herr != nil {
			return nil, herr
		}
		p = &store.Player{UID: NewUID(), Account: account, PassHash: string(hash), CreatedAt: time.Now().UnixMilli()}
		if cerr := a.st.CreatePlayer(p); cerr != nil {
			if errors.Is(cerr, store.ErrDuplicate) {
				// 并发注册同账号:按已有账号处理
				p, err = a.st.GetPlayerByAccount(key)
				if err != nil {
					return nil, err
				}
				if bcrypt.CompareHashAndPassword([]byte(p.PassHash), []byte(password)) != nil {
					return nil, ErrBadPassword
				}
				isNew = false
			} else {
				return nil, cerr
			}
		}
	default:
		return nil, err
	}

	tok, err := a.sign(p.UID)
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: tok, UID: p.UID, Account: p.Account, IsNew: isNew, CreatedAt: p.CreatedAt}, nil
}

// Profile 按 UID 取账号信息
func (a *Account) Profile(uid string) (*store.Player, error) {
	return a.st.GetPlayerByUID(uid)
}

// —— JWT(HS256,30 天) ——

type claims struct {
	UID string `json:"uid"`
	jwt.RegisteredClaims
}

func (a *Account) sign(uid string) (string, error) {
	now := time.Now()
	c := claims{
		UID: uid,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "ark-era",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(a.secret)
}

// ParseToken 校验 token 并返回 uid(供 gate 中间件使用)
func ParseToken(secret []byte, tokenStr string) (string, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return "", err
	}
	if c, ok := t.Claims.(*claims); ok && t.Valid {
		return c.UID, nil
	}
	return "", errors.New("invalid token")
}

// NewUID 与前端 makeUid 同格式:U + base36(ms) + 4 位 base36 随机,全大写
func NewUID() string {
	const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	t := strings.ToUpper(strconv.FormatInt(time.Now().UnixMilli(), 36))
	r := make([]byte, 4)
	for i := range r {
		r[i] = digits[rand.Intn(len(digits))]
	}
	return "U" + t + string(r)
}
