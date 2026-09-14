#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { companyRegistry } from '../src/data/company-registry.js';
import { augmentSearchProfile } from './job-discovery/company-scope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'config/search-profile.json');
const officialSourcesPath = path.join(root, 'config/official-sources.json');
const original = await fs.readFile(profilePath, 'utf8');
const profile = JSON.parse(original);
const scoped = augmentSearchProfile(profile, companyRegistry);

console.log(`[company-scope] companies=${scoped.companySearchMeta.total} main=${scoped.companySearchMeta.main} watch=${scoped.companySearchMeta.watch} official=${scoped.companySearchMeta.sourceManaged} pendingOfficial=${scoped.companySearchMeta.pendingOfficialSource}`);

function runScript(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, relativePath)], {
      cwd: root,
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function trustedUniversityOfficialBacked(job = {}) {
  return job?.sourceType === 'secondary'
    && job?.sourceChannel === 'university'
    && String(job?.graduationYear || '') === '2027'
    && /^https?:\/\//i.test(String(job?.officialCareerUrl || ''))
    && Boolean(job?.universitySource?.school);
}

let exitCode = 1;
try {
  await fs.writeFile(profilePath, `${JSON.stringify(scoped, null, 2)}\n`, 'utf8');

  // 1) 先刷新已知公司官方源。
  exitCode = await runScript('scripts/refresh-jobs.mjs');

  // 2) 再扫高校就业网，发现新公司和官网投递入口。
  if (exitCode === 0) {
    exitCode = await runScript('scripts/job-discovery/refresh-university-jobs.mjs');
  }

  // 3) 把高校详情页发现的官方入口桥接到 official source / adapter queue。
  //    若本轮新增了已支持ATS源，则立即再跑一次官方抓取，不等下一轮定时任务。
  if (exitCode === 0) {
    const sourcesBefore = await fs.readFile(officialSourcesPath, 'utf8');
    exitCode = await runScript('scripts/job-discovery/university-official-bridge.mjs');
    if (exitCode === 0) {
      const sourcesAfter = await fs.readFile(officialSourcesPath, 'utf8');
      if (sourcesAfter !== sourcesBefore) {
        console.log('[university-official-bridge] new supported official source registered; refreshing official jobs immediately');
        exitCode = await runScript('scripts/refresh-jobs.mjs');
        if (exitCode === 0) exitCode = await runScript('scripts/job-discovery/refresh-university-jobs.mjs');
      }
    }
  }

  // 4) 生产池保留公司官方岗位；高校记录只有在“明确2027 + 明确公司官网投递入口”时才受控保留。
  if (exitCode === 0) {
    exitCode = await runScript('scripts/filter-official-live-jobs.mjs');
  }
  if (exitCode === 0) {
    exitCode = await runScript('scripts/enrich-job-compensation.mjs');
  }
  if (exitCode === 0) {
    const livePath = path.join(root, 'src/data/live-jobs.js');
    const liveModule = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
    const stats = liveModule.discoveryMeta?.stats?.compensation;
    const invalidSourceJobs = (liveModule.liveJobs || []).filter((job) => job?.sourceType !== 'official' && !trustedUniversityOfficialBacked(job));
    if (!stats || typeof stats.disclosed !== 'number' || stats.disclosed < 1) {
      console.error(`[compensation-check] FAIL: stats.compensation missing or disclosed<1 (got ${JSON.stringify(stats)})`);
      exitCode = 1;
    } else if (invalidSourceJobs.length) {
      console.error(`[source-policy-check] FAIL: production liveJobs contains ${invalidSourceJobs.length} untrusted non-official records`);
      exitCode = 1;
    } else {
      const bridgeCount = (liveModule.liveJobs || []).filter(trustedUniversityOfficialBacked).length;
      console.log(`[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`);
      console.log(`[source-policy-check] OK official-preferred jobs=${liveModule.liveJobs.length} trustedUniversityOfficialBacked=${bridgeCount}`);
    }
  }
} finally {
  await fs.writeFile(profilePath, original, 'utf8');
}

process.exitCode = exitCode;
