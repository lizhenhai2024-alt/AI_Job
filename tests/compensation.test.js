import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompensation, enrichJobCompensation } from '../src/core/compensation.js';

test('parses monthly K range with explicit salary months and annualizes it', () => {
  const result = normalizeCompensation({ salary: '15K-25K·14薪', sourceType: 'official' });
  assert.equal(result.disclosed, true);
  assert.equal(result.monthlyMin, 15000);
  assert.equal(result.monthlyMax, 25000);
  assert.equal(result.salaryMonths, 14);
  assert.equal(result.annualMin, 210000);
  assert.equal(result.annualMax, 350000);
  assert.match(result.monthlyDisplay, /1\.5万–2\.5万\/月/);
  assert.match(result.annualDisplay, /21万–35万\/年/);
  assert.match(result.annualDisplay, /14薪/);
});

test('parses yuan monthly range and uses 12 salary months only as an explicit estimate', () => {
  const result = normalizeCompensation({ salary: '15000-22000元/月', sourceType: 'official' });
  assert.equal(result.monthlyMin, 15000);
  assert.equal(result.monthlyMax, 22000);
  assert.equal(result.salaryMonths, 12);
  assert.equal(result.annualEstimated, true);
  assert.equal(result.annualMin, 180000);
  assert.equal(result.annualMax, 264000);
  assert.match(result.annualDisplay, /按12薪推算/);
});

test('parses explicit annual package and derives monthly equivalent as estimate', () => {
  const result = normalizeCompensation({ salary: '年薪 24-36万', sourceType: 'official' });
  assert.equal(result.annualMin, 240000);
  assert.equal(result.annualMax, 360000);
  assert.equal(result.monthlyEstimated, true);
  assert.equal(result.monthlyMin, 20000);
  assert.equal(result.monthlyMax, 30000);
  assert.match(result.monthlyDisplay, /估算/);
});

test('does not invent salary when source says negotiable', () => {
  const result = normalizeCompensation({ salary: '面议', sourceType: 'official' });
  assert.equal(result.disclosed, false);
  assert.equal(result.monthlyDisplay, '未披露');
  assert.equal(result.annualDisplay, '未披露');
  assert.equal(result.monthlyMin, null);
  assert.equal(result.annualMin, null);
});

test('secondary salary evidence is marked for official-site recheck', () => {
  const result = enrichJobCompensation({ salary: '20K-30K', sourceType: 'secondary', source: '牛客公开职位' });
  assert.equal(result.compensation.confidence, 'medium');
  assert.match(result.compensation.sourceLabel, /待官网复核/);
  assert.equal(result.monthlySalary, '2万–3万/月');
});
