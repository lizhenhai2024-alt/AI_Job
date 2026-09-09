import test from 'node:test';
import assert from 'node:assert/strict';
import { mergedCompanyRiskHistory, companyRiskProfile, companyRiskSummary, evidenceLevelLabel, riskTypeLabel, validateRiskEvent } from '../src/core/company-risk.js';

test('company aliases resolve across baseline and priority risk libraries', () => {
  assert.equal(companyRiskProfile('腾讯控股')?.company, '腾讯');
  assert.equal(companyRiskProfile('ByteDance')?.company, '字节跳动');
  assert.equal(companyRiskProfile('特斯拉中国')?.company, '特斯拉');
  assert.equal(companyRiskProfile('MINISO')?.company, '名创优品');
  assert.equal(companyRiskProfile('Leapmotor')?.company, '零跑汽车');
  assert.equal(companyRiskProfile('致欧家居科技股份有限公司')?.company, '致欧家居');
});

test('high-confidence media events and community internship signals remain separated', () => {
  const summary = companyRiskSummary('腾讯');
  assert.ok(summary.highConfidence.some((event) => event.type === 'layoff'));
  assert.ok(summary.community.some((event) => event.type === 'intern_conversion'));
  assert.ok(summary.internConversion.length >= 1);
});

test('priority-company records retain their evidence scope without creating blacklist verdicts', () => {
  const miniso = companyRiskSummary('名创优品');
  assert.ok(miniso.events.some((event) => event.type === 'compensation' && /疫情/.test(event.scope)));
  const leapmotor = companyRiskSummary('零跑汽车');
  assert.ok(leapmotor.events.some((event) => event.type === 'restructuring' && /海外/.test(event.scope)));
  const songmics = companyRiskSummary('致欧家居');
  assert.ok(songmics.highConfidence.some((event) => event.evidenceLevel === 'A'));
  for (const summary of [miniso, leapmotor, songmics]) {
    assert.equal('score' in summary, false);
    assert.equal('tier' in summary, false);
    assert.equal('blacklist' in summary, false);
  }
});

test('risk intelligence exposes evidence labels but no company score or blacklist verdict', () => {
  const summary = companyRiskSummary('小米');
  assert.equal(evidenceLevelLabel('B'), '高可信媒体/公司回应');
  assert.equal(riskTypeLabel('layoff'), '裁员/优化');
  assert.equal(riskTypeLabel('intern_conversion'), '实习转正/留用风险');
  assert.equal(riskTypeLabel('offer_change'), '校招毁约/缩招');
  assert.equal(riskTypeLabel('work_intensity'), '长期加班/工作强度争议');
  assert.equal(riskTypeLabel('compensation'), '薪资倒挂/调薪争议');
  assert.equal('score' in summary, false);
  assert.equal('tier' in summary, false);
  assert.equal('blacklist' in summary, false);
});

test('every stored risk event must carry time source url and evidence level', () => {
  const invalid = [];
  for (const profile of mergedCompanyRiskHistory) {
    for (const event of profile.events || []) {
      const result = validateRiskEvent(event);
      if (!result.valid) invalid.push({ company: profile.company, id: event.id, reasons: result.reasons });
    }
  }
  assert.deepEqual(invalid, []);
});

test('invalid or D-level rumor events are not exposed as factual history', () => {
  const invalid = validateRiskEvent({ id: 'bad', type: 'layoff', evidenceLevel: 'C' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.reasons.some((reason) => /日期/.test(reason)));
  assert.ok(invalid.reasons.some((reason) => /来源/.test(reason)));
});

test('unknown companies are explicitly no-data rather than risk-free', () => {
  const summary = companyRiskSummary('不存在的测试公司');
  assert.equal(summary.hasData, false);
  assert.deepEqual(summary.events, []);
});
