import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCompanyKey, sameCanonicalCompany } from '../src/core/company-normalization.js';

test('legal suffixes and safe terminal descriptors normalize known company aliases', () => {
  assert.equal(canonicalCompanyKey('宁德时代新能源科技股份有限公司'), canonicalCompanyKey('宁德时代'));
  assert.equal(canonicalCompanyKey('CATL'), canonicalCompanyKey('宁德时代'));
  assert.equal(canonicalCompanyKey('示例国际集团有限公司'), canonicalCompanyKey('示例国际'));
});

test('descriptor words inside a distinctive company name are not globally erased', () => {
  assert.notEqual(canonicalCompanyKey('星河科技创新有限公司'), canonicalCompanyKey('星河创新有限公司'));
  assert.equal(sameCanonicalCompany('星河科技创新有限公司', '星河创新有限公司'), false);
});

test('leading 中国 is preserved while trailing 中国 can represent a regional suffix', () => {
  assert.equal(canonicalCompanyKey('中国移动有限公司').startsWith('中国移动'), true);
  assert.equal(canonicalCompanyKey('博世中国'), canonicalCompanyKey('博世'));
});
