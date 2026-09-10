.PHONY: server web build test tidy e2e clean

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

clean:
	rm -rf server/bin .arena-tmp
