import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSalary } from '../scripts/job-discovery/core.mjs';

test('extracts annual salary range with 万', () => {
  assert.match(extractSalary('年薪20-35万'), /20-35万/);
});

test('extracts annual salary range with W', () => {
  assert.match(extractSalary('年收入25-40W'), /25-40W/i);
});

test('extracts single annual salary', () => {
  assert.match(extractSalary('年薪30万'), /30万/);
});

test('extracts monthly K range with 薪 suffix', () => {
  assert.match(extractSalary('月薪15-25K·14薪'), /15-25K.*14薪/);
});

test('extracts monthly K range without prefix', () => {
  assert.match(extractSalary('薪资：15-25K'), /15-25K/);
});

test('extracts pre-tax monthly K range', () => {
  assert.match(extractSalary('税前20-30K'), /20-30K/);
});

test('extracts after-tax monthly K', () => {
  assert.match(extractSalary('税后月薪15K'), /15K/);
});

test('extracts single monthly K', () => {
  assert.match(extractSalary('月薪18K'), /18K/);
});

test('extracts monthly yuan range', () => {
  assert.match(extractSalary('月薪15000-22000元/月'), /15000-22000/);
});

test('extracts W range per year', () => {
  assert.match(extractSalary('9W-11W 元/年'), /9W-11W/i);
});

test('extracts 万 range per year', () => {
  assert.match(extractSalary('14-18 万元/年'), /14-18.*万/);
});

test('returns empty for 面议', () => {
  assert.equal(extractSalary('薪资面议'), '');
  assert.equal(extractSalary('待遇面议'), '');
  assert.equal(extractSalary('面议'), '');
});

test('returns empty for empty input', () => {
  assert.equal(extractSalary(''), '');
  assert.equal(extractSalary(null), '');
});

test('returns empty for text without salary', () => {
  assert.equal(extractSalary('负责海外运营工作，要求英语六级'), '');
});

test('extracts salary from longer JD text', () => {
  const jd = '岗位职责：负责海外市场推广。任职要求：英语可作为工作语言。薪资范围：15-25K·14薪。';
  assert.match(extractSalary(jd), /15-25K.*14薪/);
});

test('extracts K range with context word', () => {
  assert.match(extractSalary('薪资待遇15-25K'), /15-25K/);
});

test('extracts 万 range with context word', () => {
  assert.match(extractSalary('年度总包20-35万'), /20-35万/);
});

test('does not match unreasonable K values', () => {
  // 2K is too low for campus recruiting
  assert.equal(extractSalary('月薪2K'), '');
});

test('extracts salary range label prefix', () => {
  assert.match(extractSalary('薪资范围：15-25K'), /15-25K/);
});

test('handles various range separators', () => {
  assert.match(extractSalary('月薪15~25K'), /15~25K/);
  assert.match(extractSalary('月薪15至25K'), /15至25K/);
});
