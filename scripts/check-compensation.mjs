#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
const stats = mod.discoveryMeta?.stats?.compensation;

if (!stats || typeof stats.disclosed !== 'number' || stats.disclosed < 1) {
  console.error(`[compensation-check] FAIL: stats.compensation missing or disclosed<1: ${JSON.stringify(stats)}`);
  process.exit(1);
}

console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);
