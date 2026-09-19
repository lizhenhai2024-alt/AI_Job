import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCompanyKey } from './company-registry.js';

test('Jingyu opportunity company aliases resolve to canonical AI_Job companies', () => {
  assert.equal(canonicalCompanyKey('Great Wall Power'), canonicalCompanyKey('长城电源技术有限公司'));
  assert.equal(canonicalCompanyKey('Topband'), canonicalCompanyKey('拓邦股份'));
  assert.equal(canonicalCompanyKey('KUKA HOME'), canonicalCompanyKey('顾家家居'));
});
