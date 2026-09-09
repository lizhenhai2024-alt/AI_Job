#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { companyRegistry } from '../src/data/company-registry.js';
import { augmentSearchProfile } from './job-discovery/company-scope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'config/search-profile.json');
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

let exitCode = 1;
try {
  await fs.writeFile(profilePath, `${JSON.stringify(scoped, null, 2)}\n`, 'utf8');
  exitCode = await runScript('scripts/refresh-jobs.mjs');
  if (exitCode === 0) {
    exitCode = await runScript('scripts/job-discovery/refresh-university-jobs.mjs');
  }
} finally {
  await fs.writeFile(profilePath, original, 'utf8');
}

process.exitCode = exitCode;
