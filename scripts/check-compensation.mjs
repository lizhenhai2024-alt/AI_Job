#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
const stats = mod.discoveryMeta?.stats?.compensation;
const headcount = mod.discoveryMeta?.stats?.headcount;
const publication = mod.discoveryMeta?.stats?.publication;

if (!stats || typeof stats.disclosed !== 'number' || stats.disclosed < 1) {
  console.error(`[compensation-check] FAIL: stats.compensation missing or disclosed<1: ${JSON.stringify(stats)}`);
  process.exit(1);
}

if (!headcount || typeof headcount.disclosed !== 'number' || typeof headcount.jobLevel !== 'number' || typeof headcount.programLevel !== 'number') {
  console.error(`[headcount-check] FAIL: stats.headcount missing or invalid: ${JSON.stringify(headcount)}`);
  process.exit(1);
}
if (!publication || typeof publication.known !== 'number') {
  console.error(`[publication-check] FAIL: stats.publication missing or invalid: ${JSON.stringify(publication)}`);
  process.exit(1);
}
console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);
console.log(`[headcount-check] OK disclosed=${headcount.disclosed}/${headcount.totalJobs} job=${headcount.jobLevel} program=${headcount.programLevel}`);
console.log(`[publication-check] OK known=${publication.known}/${publication.totalJobs}`);
