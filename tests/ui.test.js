import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
const imeGuardSource = fs.readFileSync(new URL('../src/ime-guard.js', import.meta.url), 'utf8');

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

test('company radar exposes safe add-company intake and ATS analysis queue', () => {
  for (const text of ['+ 添加公司', '加入公司库并提交分析', '官方招聘 / 校招链接', '分析状态：']) {
    assert.ok(appSource.includes(text), `missing company-intake UI behavior: ${text}`);
  }
  assert.ok(appSource.includes('createCompanyIntake'));
  assert.ok(appSource.includes('buildCompanyIntakeIssueUrl'));
  assert.ok(appSource.includes('upsertCompanyIntake'));
  assert.ok(appSource.includes("window.open(issueUrl, '_blank', 'noopener')"));
});

test('keyword input preserves Chinese IME composition until candidate commit', () => {
  assert.ok(bootstrapSource.indexOf("import './ime-guard.js'") < bootstrapSource.indexOf("import './app.js'"));
  for (const text of ['filter-keyword', 'compositionstart', 'compositionend', 'event.isComposing', 'stopImmediatePropagation']) {
    assert.ok(imeGuardSource.includes(text), `missing IME guard behavior: ${text}`);
  }
});

test('profile page exposes evidence baseline and keeps it on save', () => {
  assert.ok(appSource.includes('简历证据基线'));
  assert.ok(appSource.includes('experienceEvidence: structuredClone'));
});
