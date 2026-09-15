import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { shouldKeep } from '../scripts/job-discovery/core.mjs';

const profile = { graduationYear: '2027', roleKeywords: ['运营'], keywords: ['英语'], targetCities: ['深圳'], strongExclude: ['软件工程师', '销售经理'], minRelevanceScore: 99 };
const now = new Date('2026-09-16T00:00:00Z');

async function source(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('discovery gate keeps active formal 2027 roles regardless of candidate fit', () => {
  assert.equal(shouldKeep({ graduationYear: '2027', title: '软件工程师', city: '北京' }, profile, now), true);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '销售经理', city: '成都' }, profile, now), true);
  assert.equal(shouldKeep({ graduationYear: '2026', title: '海外运营' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营实习生' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营', deadline: '2026-09-01' }, profile, now), false);
});

test('production refresh extracts job facts but never candidate-fit verdicts', async () => {
  const [refresh, university] = await Promise.all([
    source('scripts/refresh-jobs.mjs'),
    source('scripts/job-discovery/refresh-university-jobs.mjs')
  ]);
  for (const text of [refresh, university]) {
    // 判定入口：不得回潮（契约 docs/job-intelligence-contract-v1.md §4）
    assert.doesNotMatch(text, /shouldExcludeByPolicy/);
    assert.doesNotMatch(text, /enrichCandidateFit/);
    assert.doesNotMatch(text, /analyzeCandidateFit/);
    assert.doesNotMatch(text, /jobPolicyReasons/);
    // 事实抽取：允许且必需，并且必须真的落进 jdEvidence
    assert.match(text, /resolveJdEvidence/);
    assert.match(text, /jdEvidence/);
  }
});

test('university official bridge does not blacklist whole industries', async () => {
  const text = await source('scripts/job-discovery/university-official-bridge.mjs');
  assert.doesNotMatch(text, /EXCLUDED_CATEGORIES/);
  assert.doesNotMatch(text, /银行\|证券\|保险\|信托\|基金\|期货\|军工\|审计\|咨询/);
});
