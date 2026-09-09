import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('match analysis exposes eligibility, five-step V3 reasoning and direct real evidence', () => {
  for (const text of ['投递资格', '五步 JD + 投递判断', '真实经历证据', 'V3 评分维度']) {
    assert.ok(appSource.includes(text), `missing UI section: ${text}`);
  }
  assert.ok(appSource.includes('job.match.fourStepAnalysis'));
  assert.ok(appSource.includes('job.match.experienceEvidence?.directMatches'));
});

test('job radar exposes daily shortlist and full-pool modes', () => {
  for (const text of ['今日精选', '全部岗位', 'buildDailyShortlist', 'dailyShortlistStats']) {
    assert.ok(appSource.includes(text), `missing daily-radar UI behavior: ${text}`);
  }
  assert.ok(appSource.includes("radarMode: 'daily'"));
  assert.ok(appSource.includes("state.radarMode = 'all'"));
});

test('profile page exposes evidence baseline and keeps it on save', () => {
  assert.ok(appSource.includes('简历证据基线'));
  assert.ok(appSource.includes('experienceEvidence: structuredClone'));
});
