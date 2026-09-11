import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildSourceHealth } from '../scripts/job-discovery/source-health.mjs';
import { providerOfJob } from '../scripts/job-discovery/snapshot-retention.mjs';

test('refresh pipeline keeps provider blocks outside the Ctrip callback and uses the source-health object contract', async () => {
  const source = await fs.readFile(new URL('../scripts/refresh-jobs.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\n\s*lo\s*\n/);
  assert.doesNotMatch(source, /\bgSourceResult\s*\(/);
  assert.match(source, /const sourceStatsByProvider = Object\.fromEntries/);
  assert.match(source, /buildSourceHealth\(sourceStatsByProvider, configuredOfficialSources\)/);

  for (const provider of ['topband', 'job51', 'phenom', 'avature', 'successfactors', 'oppo']) {
    assert.match(source, new RegExp(`'${provider}'`));
  }
  assert.match(source, /searchOppoJobs/);
});

test('refresh pipeline normalizes inherited URL and graduation-year fields before adapters', async () => {
  const source = await fs.readFile(new URL('../scripts/refresh-jobs.mjs', import.meta.url), 'utf8');

  assert.match(source, /if \(!normalized\.url && normalized\.baseUrl\) normalized\.url = normalized\.baseUrl/);
  assert.match(source, /if \(!normalized\.graduationYear && config\.graduationYear\) normalized\.graduationYear = config\.graduationYear/);
  assert.match(source, /searchMokaJobs\(config, normalizedSources\('moka'\)/);
  assert.match(source, /searchBeisenJobs\(config, normalizedSources\('beisen'\)\)/);
});

test('source health reports real provider names instead of array indexes', () => {
  const health = buildSourceHealth(
    {
      topband: {
        perPortal: {
          '拓邦股份': { listed: 3, keptJobs: 2, errors: 0, snapshotComplete: true }
        }
      }
    },
    {
      topband: [{ company: '拓邦股份' }]
    }
  );

  assert.equal(health.total, 1);
  assert.equal(health.companies[0].provider, 'topband');
  assert.equal(health.companies[0].company, '拓邦股份');
  assert.equal(health.companies[0].healthy, true);
});

test('snapshot retention recognizes the expanded official providers', () => {
  assert.equal(providerOfJob({ source: '阿里巴巴官方校招官网', sourceUrl: 'https://talent.alibaba.com/' }), 'alibaba');
  assert.equal(providerOfJob({ source: '携程官方校招官网', sourceUrl: 'https://jobs.ctrip.com/' }), 'ctrip');
  assert.equal(providerOfJob({ source: '拓邦股份官方校招官网', sourceUrl: 'https://campus.topband.com.cn/' }), 'topband');
  assert.equal(providerOfJob({ source: 'OPPO官方2027校招官网', sourceUrl: 'https://careers.oppo.com/university/oppo/campus/post/1816' }), 'oppo');
  assert.equal(providerOfJob({ source: '联合利华官方2027校招官网', sourceUrl: 'https://xyz.51job.com/' }), 'job51');
  assert.equal(providerOfJob({ source: '欧莱雅官方校招官网', sourceUrl: 'https://loachina.avature.cn/' }), 'avature');
});

test('university refresh keeps the full merged pool and writes a board-parseable terminator', async () => {
  const source = await fs.readFile(new URL('../scripts/job-discovery/refresh-university-jobs.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\.slice\(0,\s*Number\(profile\.maxJobs/);
  assert.match(source, /replace\(\/\\n\]\$\/, '\\n];'\)/);
  assert.match(source, /dedupeById\(dedupePreferOfficial\(\[\.\.\.existingJobs, \.\.\.freshUniversityJobs\]\)\)/);
});
