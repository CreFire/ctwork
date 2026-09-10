/**
 * 文件持久化存储 - 将内存数据定期备份到文件
 * 用于单机/开发环境，生产环境应替换为 MongoDB
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import store from './memoryStore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../../data/server_state.json');

export function loadFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log('[FileStore] No existing data file, starting fresh');
      return;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    store.fromJSON(data);
    console.log(`[FileStore] Loaded from ${DATA_FILE}`);
  } catch (e) {
    console.warn(`[FileStore] Load failed: ${e.message}`);
  }
}

export function saveToFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const data = store.toJSON();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[FileStore] Saved to ${DATA_FILE} (${store.getStats().leagueEntries} league entries)`);
  } catch (e) {
    console.warn(`[FileStore] Save failed: ${e.message}`);
  }
}

export function startAutoSave(intervalMs = 30000) {
  loadFromFile();
  
  const timer = setInterval(() => {
    saveToFile();
  }, intervalMs);

  // 优雅退出时保存
  process.on('SIGINT', () => {
    console.log('[FileStore] SIGINT, saving...');
    saveToFile();
    clearInterval(timer);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[FileStore] SIGTERM, saving...');
    saveToFile();
    clearInterval(timer);
    process.exit(0);
  });

  return timer;
}
