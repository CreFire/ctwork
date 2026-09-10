/**
 * 方舟纪元排行榜后端 - 主入口
 * 兼容 dueGame 协议，提供 HTTP API
 * 
 * 启动: npm run dev (server/node)
 * 端口: 3001 (可通过 PORT 环境变量覆盖)
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.mjs';
import playerRoutes from './routes/player.mjs';
import leagueRoutes from './routes/league.mjs';
import { rateLimitMiddleware } from './middleware/rateLimit.mjs';
import { loadLubanConfig, loadLubanConf } from './config/lubanLoader.mjs';
import { startAutoSave } from './storage/fileStore.mjs';
import store from './storage/memoryStore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} ${res.statusCode} ${dur}ms`);
  });
  next();
});

// 全局限流
app.use(rateLimitMiddleware(200, 60000));

// 健康检查
app.get('/health', (req, res) => {
  const luban = loadLubanConfig();
  const conf = loadLubanConf();
  res.json({
    ok: true,
    service: 'ark-era-league',
    version: '0.2.0',
    lubanVersion: luban._meta?.version || conf.version || '1.0.0',
    uptime: process.uptime(),
    stats: store.getStats(),
    ts: Date.now(),
  });
});

// API 路由
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/player', playerRoutes);
app.use('/api/v1/league', leagueRoutes);

// 兼容旧路径 /api/v1/league/top -> /api/v1/league/top (已在上面)
app.get('/api/v1/league/top', (req, res) => {
  res.redirect(307, `/api/v1/league/top?${new URLSearchParams(req.query).toString()}`);
});

// 404
app.use((req, res) => {
  res.status(404).json({ code: 404, message: `Not found: ${req.method} ${req.path}` });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.stack || err.message}`);
  res.status(500).json({ code: 500, message: 'Internal server error' });
});

// 启动
function start() {
  // 加载 Luban 配置
  const luban = loadLubanConfig();
  const conf = loadLubanConf();
  console.log(`[Server] Luban config v${luban._meta?.version} loaded, ${conf.tables?.length || 0} tables`);

  // 启动文件自动保存
  startAutoSave(30000);

  app.listen(PORT, HOST, () => {
    console.log(`\n=== 方舟纪元 ARK ERA - 排行榜后端 ===`);
    console.log(`[Server] Listening on http://${HOST}:${PORT}`);
    console.log(`[Server] Health: http://${HOST}:${PORT}/health`);
    console.log(`[Server] League Top: http://${HOST}:${PORT}/api/v1/league/top`);
    console.log(`[Server] Stats: http://${HOST}:${PORT}/api/v1/league/stats`);
    console.log(`[Server] Env: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================\n`);
  });
}

start();
