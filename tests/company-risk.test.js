import test from 'node:test';
import assert from 'node:assert/strict';
import { companyRiskProfile, companyRiskSummary, evidenceLevelLabel, riskTypeLabel } from '../src/core/company-risk.js';

test('company aliases resolve to the same risk profile', () => {
  assert.equal(companyRiskProfile('腾讯控股')?.company, '腾讯');
  assert.equal(companyRiskProfile('ByteDance')?.company, '字节跳动');
  assert.equal(companyRiskProfile('特斯拉中国')?.company, '特斯拉');
});

test('high-confidence media events and community internship signals remain separated', () => {
  const summary = companyRiskSummary('腾讯');
  assert.ok(summary.highConfidence.some((event) => event.type === 'layoff'));
  assert.ok(summary.community.some((event) => event.type === 'intern_conversion'));
  assert.ok(summary.internConversion.length >= 1);
});

test('risk intelligence exposes evidence labels but no company score or blacklist verdict', () => {
  const summary = companyRiskSummary('小米');
  assert.equal(evidenceLevelLabel('B'), '高可信媒体/公司回应');
  assert.equal(riskTypeLabel('layoff'), '裁员/人员优化');
  assert.equal('score' in summary, false);
  assert.equal('tier' in summary, false);
  assert.equal('blacklist' in summary, false);
});

test('unknown companies are explicitly no-data rather than risk-free', () => {
  const summary = companyRiskSummary('不存在的测试公司');
  assert.equal(summary.hasData, false);
  assert.deepEqual(summary.events, []);
});
