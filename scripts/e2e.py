import json, os, time, urllib.request, urllib.error

BASE = os.environ.get("ARK_BASE", "http://127.0.0.1:8090")
ok_count = 0
fail_count = 0

def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=10) as r:
            txt = r.read().decode() or "null"
            try: return r.status, json.loads(txt)
            except json.JSONDecodeError: return r.status, {"_raw": txt}
    except urllib.error.HTTPError as e:
        txt = e.read().decode() or "null"
        try: return e.code, json.loads(txt)
        except json.JSONDecodeError: return e.code, {"_raw": txt}

def check(name, cond, extra=""):
    global ok_count, fail_count
    if cond: ok_count += 1; print(f"  ✅ {name}")
    else: fail_count += 1; print(f"  ❌ {name} {extra}")

print("== 0) 健康检查 + 静态托管 ==")
st, b = call("GET", "/healthz")
check("healthz ok", st == 200 and b["ok"] is True)
st, b = call("GET", "/")
check("静态 index.html", st == 200 and "方舟纪元" in str(b)[:5000] if isinstance(b, dict) else st == 200)

print("== 1) 登录即注册 ==")
st, b = call("POST", "/api/v1/auth/login", {"account": "commander01", "password": "ark123"})
check("新账号 isNew=true", st == 200 and b["isNew"] is True, str(b))
check("返回 token+uid", bool(b.get("token")) and bool(b.get("uid")))
uid, tok = b["uid"], b["token"]

st, b = call("POST", "/api/v1/auth/login", {"account": "Commander01", "password": "ark123"})
check("大小写不敏感重复登录 isNew=false", st == 200 and b["isNew"] is False and b["uid"] == uid)

st, b = call("POST", "/api/v1/auth/login", {"account": "commander01", "password": "wrong!"})
check("错误密码 → 401", st == 401, f"st={st}")

st, b = call("POST", "/api/v1/auth/login", {"account": "ab", "password": "123"})
check("校验:账号过短 → 400", st == 400)

print("== 2) profile ==")
st, b = call("GET", "/api/v1/player/profile", token=tok)
check("profile 返回账号信息", st == 200 and b["account"] == "commander01" and b["uid"] == uid)
st, b = call("GET", "/api/v1/player/profile")
check("无 token → 401", st == 401)

print("== 3) 存档:首次拉取为空 ==")
st, b = call("GET", "/api/v1/player/save", token=tok)
check("无存档 → save=null", st == 200 and b["save"] is None, str(b)[:100])

now = int(time.time() * 1000)
save_v1 = {
    "version": 1, "uid": uid, "createdAt": now - 60000, "lastTickAt": now - 8000,
    "run": {
        "runId": 1, "startedAt": now - 60000, "deadlineAt": now - 60000 + 3600000,
        "res": {"energy": 150, "material": 30, "research": 8, "special": 0},
        "route": None,
        "buildings": {"b_solar": 6, "b_scavenge": 2},
        "research": {"r_command": True},
        "clickUp": {}, "routeUp": {}, "firedStories": [],
        "nextEventAt": now + 100000,
        "stats": {"energyTotal": 300, "clicks": 40}
    },
    "meta": {"cores": 0, "coreUp": {}, "runs": 0, "escapes": 0, "deaths": 0,
             "bestRemainSec": 0, "totalEnergy": 300, "totalClicks": 40}
}
print("== 4) 正常推档 ==")
st, b = call("POST", "/api/v1/player/save", save_v1, token=tok)
check("推档 ok", st == 200 and b.get("ok") is True, str(b))
check("无反作弊告警", len(b.get("warnings", [])) == 0, str(b.get("warnings")))

st, b = call("GET", "/api/v1/player/save", token=tok)
check("回读存档一致", st == 200 and b["save"]["uid"] == uid and b["save"]["run"]["buildings"]["b_solar"] == 6)
saved_at = b["serverSavedAt"]

print("== 5) 反作弊:资源暴增 ==")
cheat = json.loads(json.dumps(save_v1))
cheat["run"]["res"]["energy"] = 1e15
cheat["lastTickAt"] = now - 8000
st, b = call("POST", "/api/v1/player/save", cheat, token=tok)
check("推档被接受但有告警", st == 200 and len(b.get("warnings", [])) > 0, str(b))
st, b = call("GET", "/api/v1/player/save", token=tok)
clamped = b["save"]["run"]["res"]["energy"]
check(f"能量被钳制({clamped:.0f} < 1e15)", clamped < 1e6)

print("== 6) 反作弊:买不起的建筑 ==")
cheat2 = json.loads(json.dumps(save_v1))
cheat2["run"]["res"]["energy"] = 200
cheat2["run"]["res"]["material"] = 50
cheat2["run"]["buildings"]["b_zero"] = 5  # 零点引擎×5,天价
st, b = call("POST", "/api/v1/player/save", cheat2, token=tok)
st2, b2 = call("GET", "/api/v1/player/save", token=tok)
check("未支付建筑被回退", b2["save"]["run"]["buildings"].get("b_zero", 0) == 0, str(b2["save"]["run"]["buildings"]))

print("== 7) 反作弊:UID 伪造 ==")
fake = json.loads(json.dumps(save_v1)); fake["uid"] = "UFAKE123"
st, b = call("POST", "/api/v1/player/save", fake, token=tok)
check("UID 不匹配 → 403", st == 403, f"st={st}")

print("== 8) 排行榜 ==")
st, b = call("POST", "/api/v1/auth/login", {"account": "rival_fleet", "password": "ark12345"})
rid, rtok = b["uid"], b["token"]
rival = json.loads(json.dumps(save_v1))
rival["uid"] = rid
rival["run"]["stats"]["energyTotal"] = 98765
rival["meta"]["totalEnergy"] = 98765
call("POST", "/api/v1/player/save", rival, token=rtok)
st, b = call("GET", "/api/v1/league/top?n=10", token=tok)
check("榜单 2 人", st == 200 and len(b["list"]) == 2, str(b)[:200])
check("榜单按产能排序(rival 第一)", b["list"][0]["account"] == "rival_fleet" and b["list"][0]["runScore"] == 98765)
check("返回我的名次 me.rank", b.get("me") and b["me"]["rank"] == 2, str(b.get("me")))

print("== 9) 清档 ==")
st, b = call("DELETE", "/api/v1/player/save", token=rtok)
st, b = call("GET", "/api/v1/player/save", token=rtok)
check("清档后 save=null", b["save"] is None)

print(f"\n===== 结果: {ok_count} 通过 / {fail_count} 失败 =====")
exit(1 if fail_count else 0)
