#!/usr/bin/env node
/**
 * 配置校验脚本 - 独立于生成流程，用于 CI/CD 校验所有 CSV 表
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TABLES_DIR = path.join(ROOT, 'server/luban/tables');

function parseCsvSimple(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('##'));
  if (lines.length === 0) return { headers: [], rows: [] };
  const headerLine = lines[0].replace(/^#/, '').trim();
  const headers = headerLine.split(',').map(s => s.trim());
  const rows = lines.slice(1).map((line, idx) => {
    const parts = line.split(',').map(s => s.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = parts[i] || '');
    obj.__line = idx + 2;
    return obj;
  });
  return { headers, rows };
}

function checkDuplicateIds(rows, key, file) {
  const seen = new Set();
  const dups = [];
  for (const r of rows) {
    const id = r[key];
    if (!id) continue;
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  if (dups.length) {
    console.error(`[FAIL] ${file}: duplicate ${key}: ${dups.join(', ')}`);
    return false;
  }
  return true;
}

function main() {
  console.log('[Validate] Checking Luban tables...');
  let ok = true;

  const tables = [
    { file: 'tb_global.csv', key: 'key' },
    { file: 'tb_building.csv', key: 'id' },
    { file: 'tb_click_upgrade.csv', key: 'id' },
    { file: 'tb_era.csv', key: 'id' },
    { file: 'tb_research.csv', key: 'id' },
    { file: 'tb_route.csv', key: 'id' },
    { file: 'tb_route_upgrade.csv', key: 'id' },
    { file: 'tb_core_upgrade.csv', key: 'id' },
    { file: 'tb_story.csv', key: 'id' },
    { file: 'tb_random_event.csv', key: 'id' },
  ];

  for (const t of tables) {
    const fp = path.join(TABLES_DIR, t.file);
    if (!fs.existsSync(fp)) {
      console.error(`[FAIL] Missing table: ${t.file}`);
      ok = false;
      continue;
    }
    try {
      const { rows } = parseCsvSimple(fp);
      console.log(`[OK] ${t.file}: ${rows.length} rows`);
      if (!checkDuplicateIds(rows, t.key, t.file)) ok = false;

      // 额外校验
      if (t.file === 'tb_building.csv') {
        for (const r of rows) {
          const scale = parseFloat(r.scale);
          if (isNaN(scale) || scale < 1.0 || scale > 2.0) {
            console.error(`[FAIL] ${t.file}:${r.__line} invalid scale ${r.scale} for ${r.id}`);
            ok = false;
          }
          const perSec = parseFloat(r.per_sec);
          if (isNaN(perSec) || perSec <= 0) {
            console.error(`[FAIL] ${t.file}:${r.__line} invalid per_sec ${r.per_sec} for ${r.id}`);
            ok = false;
          }
        }
      }

      if (t.file === 'tb_research.csv') {
        for (const r of rows) {
          const era = parseInt(r.era, 10);
          if (isNaN(era) || era < 0 || era > 5) {
            console.error(`[FAIL] ${t.file}:${r.__line} invalid era ${r.era} for ${r.id}`);
            ok = false;
          }
        }
      }

    } catch (e) {
      console.error(`[FAIL] ${t.file}: ${e.message}`);
      ok = false;
    }
  }

  // 检查 luban.conf
  const confPath = path.join(ROOT, 'server/luban/luban.conf');
  if (!fs.existsSync(confPath)) {
    console.error('[FAIL] Missing luban.conf');
    ok = false;
  } else {
    try {
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
      console.log(`[OK] luban.conf version ${conf.version}, ${conf.tables?.length} tables`);
      if (!conf.tables || conf.tables.length < 10) {
        console.warn('[WARN] luban.conf tables count <10, expected 12');
      }
    } catch (e) {
      console.error(`[FAIL] luban.conf parse error: ${e.message}`);
      ok = false;
    }
  }

  // 检查 Defines
  const defines = ['__enums__.xml', '__beans__.xml', '__tables__.xml'];
  for (const f of defines) {
    const fp = path.join(ROOT, 'server/luban/Defines', f);
    if (!fs.existsSync(fp)) {
      console.error(`[FAIL] Missing Defines/${f}`);
      ok = false;
    } else {
      console.log(`[OK] Defines/${f}`);
    }
  }

  // 检查生成产物
  const genFiles = ['src/game/generated/Tables.ts', 'src/game/generated/Beans.ts', 'src/game/generated/Enums.ts', 'src/game/generated/data/tables.json'];
  for (const f of genFiles) {
    const fp = path.join(ROOT, f);
    if (!fs.existsSync(fp)) {
      console.error(`[FAIL] Missing generated file: ${f} (run npm run gen:luban)`);
      ok = false;
    } else {
      console.log(`[OK] ${f}`);
    }
  }

  if (ok) {
    console.log('\n[Validate] All checks passed! ✅');
    process.exit(0);
  } else {
    console.log('\n[Validate] Some checks failed! ❌');
    process.exit(1);
  }
}

main();
