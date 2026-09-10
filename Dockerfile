# 方舟纪元 ARK ERA — 全栈镜像(前端构建 + Go 网关)
# 构建: docker build -t ctwork .
# 运行: docker run -p 8090:8090 -v ark-data:/app/data ctwork
# 联通 MongoDB: 传 -e ARK_MONGO_URI=mongodb://host:27017/ark_era

FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM golang:1.27-alpine AS srv
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server ./
RUN CGO_ENABLED=0 go build -o /ctwork-server ./cmd/server

FROM alpine:3.20
RUN adduser -D ark
WORKDIR /app
COPY --from=srv /ctwork-server /app/ctwork-server
COPY --from=web /app/dist /app/dist
ENV ARK_ADDR=:8090 ARK_WEB_DIST=/app/dist ARK_DATA_DIR=/app/data
VOLUME /app/data
USER ark
EXPOSE 8090
CMD ["/app/ctwork-server"]
