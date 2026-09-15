#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalCompanyKey } from '../src/core/company-normalization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'config/source-discovery.json');
const config = JSON.parse(await fs.readFile(file, 'utf8'));
const next = {};

function preferred(a = {}, b = {}) {
  const aTime = String(a.lastCheckedAt || a.updatedAt || '');
  const bTime = String(b.lastCheckedAt || b.updatedAt || '');
  return bTime > aTime ? b : a;
}

for (const item of Object.values(config.companies || {})) {
  const key = canonicalCompanyKey(item?.name || '');
  if (!key) continue;
  next[key] = next[key] ? preferred(next[key], item) : item;
}

config.companies = next;
config.updatedAt = new Date().toISOString();
await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`[canonical-migration] source-discovery companies=${Object.keys(next).length}`);
