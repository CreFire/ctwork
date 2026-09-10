.PHONY: server web build test tidy e2e clean gen validate parity smoke fixture check

server: ## 编译后端二进制
	cd server && go build -o bin/ctwork-server ./cmd/server

web: ## 构建前端单文件 dist/index.html
	npm run build

build: server web ## 前后端全量构建

test: ## Go 测试(含 TS 双端一致性 fixture)
	cd server && go test ./...

tidy: ## 整理 go.mod
	cd server && go mod tidy

e2e: build ## 启动单进程服务(静态 + API 同端口)
	./server/bin/ctwork-server

gen: ## 由 Luban CSV 生成双端配置(TS/Go/JSON)
	npm run gen:luban

validate: ## 校验 Luban 表结构与数值范围
	npm run validate:config

parity: ## Luban 表 ⇄ Go 权威数值表 一致性守卫
	npm run check:parity

smoke: ## 引擎闭环冒烟(Node 真实执行 config+engine)
	npm run smoke

fixture: ## 重新生成 TS↔Go 一致性 fixture
	npm run fixture

check: gen validate parity smoke ## 配置全链路检查(生成 → 校验 → 一致性 → 冒烟)
	npx tsc --noEmit

clean:
	rm -rf server/bin .arena-tmp dist
