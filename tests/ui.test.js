import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
const imeGuardSource = fs.readFileSync(new URL('../src/ime-guard.js', import.meta.url), 'utf8');

test('AI_Job UI declares the discovery/intelligence boundary and links to the final board', () => {
  for (const text of ['岗位发现 / 情报库', '职责边界', 'S/A/B、匹配度、岗位方向、公司匹配度、是否值得投', 'campus-job-board-mu.vercel.app']) {
    assert.ok(appSource.includes(text), `missing boundary UI: ${text}`);
  }
});

test('AI_Job main UI does not import or execute the old final matching engine', () => {
  assert.equal(appSource.includes("./core/matcher.js"), false);
  assert.equal(appSource.includes('rankJobs('), false);
  assert.equal(appSource.includes('buildDailyShortlist'), false);
  assert.equal(appSource.includes('match.score'), false);
  assert.equal(appSource.includes('match.tier'), false);
});

test('job intelligence UI exposes provenance, completeness and five source channels', () => {
  for (const text of ['五大渠道', '来源状态', '情报字段', '多源交叉核实', '待官网复核', 'sourceChannels']) {
    assert.ok(appSource.includes(text), `missing intelligence UI behavior: ${text}`);
  }
});

test('company radar is evidence-only and does not show company match score', () => {
  assert.ok(appSource.includes('公司招聘情报'));
  assert.ok(appSource.includes('不做公司匹配度评级'));
  assert.equal(appSource.includes('bestTier'), false);
  assert.equal(appSource.includes('bestScore'), false);
});

test('company intake remains available for source discovery expansion', () => {
  for (const text of ['添加公司到发现队列', '加入公司库并提交分析', '官方招聘 / 校招链接', 'createCompanyIntake']) {
    assert.ok(appSource.includes(text), `missing company-intake UI behavior: ${text}`);
  }
  assert.ok(appSource.includes("window.open(issueUrl, '_blank', 'noopener')"));
});

test('keyword input preserves Chinese IME composition until candidate commit', () => {
  assert.ok(bootstrapSource.indexOf("import './ime-guard.js'") < bootstrapSource.indexOf("import './app.js'"));
  for (const text of ['filter-keyword', 'compositionstart', 'compositionend', 'event.isComposing', 'stopImmediatePropagation']) {
    assert.ok(imeGuardSource.includes(text), `missing IME guard behavior: ${text}`);
  }
});
