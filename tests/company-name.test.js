import test from 'node:test';
import assert from 'node:assert/strict';
import { companyKey, sameCompany } from '../src/core/company-name.js';

test('companyKey strips suffixes, bracketed qualifiers, ranking emoji and punctuation', () => {
  assert.equal(companyKey('致欧家居科技股份有限公司'), '致欧家居');
  assert.equal(companyKey('名创优品（广州）有限责任公司'), '名创优品');
  assert.equal(companyKey('🔴 腾讯控股'), '腾讯');
  assert.equal(companyKey('MINISO'), 'miniso');
});

test('sameCompany matches exact and suffix-stripped forms', () => {
  assert.equal(sameCompany('腾讯', '腾讯控股'), true);
  assert.equal(sameCompany('致欧家居科技股份有限公司', '致欧家居'), true);
  assert.equal(sameCompany('特斯拉中国', '特斯拉'), true);
});

test('sameCompany refuses fuzzy matches on short normalised names', () => {
  // 中国平安 -> 平安 also collapses 平安银行 / 平安科技 to 平安. Attributing one
  // company's layoff history to another is the failure this guards.
  assert.equal(sameCompany('中国平安', '平安银行'), false);
  assert.equal(sameCompany('中国银行', '工商银行'), false);
  // Exact matches on short names must still work.
  assert.equal(sameCompany('腾讯', '腾讯'), true);
  assert.equal(sameCompany('美团', '美团'), true);
});

test('sameCompany rejects empty and unparseable input', () => {
  assert.equal(sameCompany('', '腾讯'), false);
  assert.equal(sameCompany('腾讯', ''), false);
  assert.equal(sameCompany('集团', '中国'), false);
});
