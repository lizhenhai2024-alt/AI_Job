import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('match analysis exposes eligibility, four-step reasoning and real evidence', () => {
  for (const text of ['投递资格', '四步 JD 判断', '真实经历证据']) {
    assert.ok(appSource.includes(text), `missing UI section: ${text}`);
  }
  assert.ok(appSource.includes('job.match.fourStepAnalysis'));
  assert.ok(appSource.includes('job.match.experienceEvidence'));
});

test('profile page exposes evidence baseline and keeps it on save', () => {
  assert.ok(appSource.includes('简历证据基线'));
  assert.ok(appSource.includes('experienceEvidence: structuredClone'));
});
