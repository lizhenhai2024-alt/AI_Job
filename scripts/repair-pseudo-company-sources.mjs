#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'config/official-sources.json');

export function isPseudoCompany(name = '') {
  const text = String(name || '').normalize('NFKC').replace(/\s+/g, '').trim();
  return /^\d+[.、．-]?(?:研发|制造|营销|职能|事业|服务|金融|技术|生产|销售|管理|水平事业)(?:类)?单位$/u.test(text);
}

export function repairSources(config = {}) {
  let changed = 0;
  for (const [provider, value] of Object.entries(config)) {
    if (!Array.isArray(value)) continue;
    const next = [];
    for (const item of value) {
      if (!isPseudoCompany(item?.company)) {
        next.push(item);
        continue;
      }
      const url = String(item?.url || item?.baseUrl || '').trim();
      if (provider === 'moka' && /\/dfmc\/164438(?:\b|\/|#|\?)/i.test(url)) {
        next.push({
          ...item,
          company: '东风汽车集团有限公司',
          monitoringNote: `${item.monitoringNote || ''}；已纠正高校页面章节标题误识别，官方入口归属东风汽车集团有限公司`.replace(/^；/, '')
        });
      }
      changed += 1;
    }
    config[provider] = next;
  }
  return changed;
}

async function main() {
  const config = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  const changed = repairSources(config);
  if (!changed) {
    console.log('[repair-pseudo-company-sources] no changes');
    return;
  }
  await fs.writeFile(sourcePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`[repair-pseudo-company-sources] repaired=${changed}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
