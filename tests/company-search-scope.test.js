import test from 'node:test';
import assert from 'node:assert/strict';
import { companyRegistry } from '../src/data/company-registry.js';
import { buildCompanySearchScope, augmentSearchProfile } from '../scripts/job-discovery/company-scope.mjs';

test('main and watch companies from the imported library enter job-search scope', () => {
  const scope = buildCompanySearchScope(companyRegistry);
  const names = new Set(scope.map((item) => item.name));
  assert.ok(names.has('蔚来'), 'NIO should be in company-driven search scope');
  assert.ok(names.has('华为'), 'morning imported main companies should be searchable');
  assert.ok(names.has('ABB'), 'watch companies should remain discoverable');
});

test('risk and removed companies do not enter active discovery scope', () => {
  const scope = buildCompanySearchScope(companyRegistry);
  assert.equal(scope.some((item) => item.status === '风险' || item.status === '移出'), false);
});

test('search profile is augmented from registry without replacing role or language keywords', () => {
  const profile = augmentSearchProfile({ keywords: ['英语', '海外'], roleKeywords: ['运营'] }, companyRegistry);
  assert.ok(profile.keywords.includes('英语'));
  assert.ok(profile.keywords.includes('蔚来'));
  assert.ok(profile.targetCompanies.includes('蔚来'));
  assert.ok(profile.companySearchMeta.total > 100);
  assert.equal(profile.companySearchMeta.total, profile.companySearchMeta.main + profile.companySearchMeta.watch);
});
