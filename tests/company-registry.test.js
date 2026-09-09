import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyRegistry,
  canonicalCompanyKey,
  isValidCompanyRecord,
  normalizeCities,
  normalizeTracks
} from '../src/data/company-registry.js';
import { sourceRegistry } from '../src/data/source-registry.js';

test('company registry removes non-company rows imported from city/ranking tables', () => {
  const forbidden = new Set(['🔟', '东莞', '佛山', '惠州', '珠海']);
  assert.equal(companyRegistry.some((record) => forbidden.has(record.name)), false);
  assert.equal(companyRegistry.every(isValidCompanyRecord), true);
});

test('non-main pool rows do not keep leaked industry labels', () => {
  const polluted = companyRegistry.filter((record) => record.status !== '主投' && (record.industries || []).length);
  assert.deepEqual(polluted, []);
});

test('cities and target tracks are normalized into separate fields', () => {
  assert.deepEqual(normalizeCities(['上海/北京 有office', '品牌市场/HR/运营']), ['上海', '北京']);
  assert.deepEqual(normalizeTracks([], ['上海/北京 有office', '品牌市场/HR/运营']), ['品牌市场', 'HR', '运营']);
  for (const record of companyRegistry) {
    assert.equal((record.cities || []).some((value) => /市场|营销|HR|运营|商务|供应链|客户|产品/i.test(value)), false, `${record.name} has track data in cities`);
  }
});

test('all official source entries are represented in the unified company registry', () => {
  assert.equal(sourceRegistry.length, 38);
  for (const source of sourceRegistry) {
    const key = canonicalCompanyKey(source.company);
    const match = companyRegistry.find((record) => {
      const candidate = canonicalCompanyKey(record.name);
      return candidate === key || (Math.min(candidate.length, key.length) >= 3 && (candidate.includes(key) || key.includes(candidate)));
    });
    assert.ok(match, `${source.provider}:${source.company} missing from company registry`);
    assert.ok(match.sourceManaged, `${source.company} should be source-managed`);
    assert.ok(match.sourceProviders.includes(source.provider), `${source.company} missing provider ${source.provider}`);
  }
});

test('common official aliases collapse onto existing canonical companies', () => {
  const bosch = companyRegistry.find((record) => record.name === '博世');
  assert.ok(bosch?.sourceProviders.includes('moka'));
  const kpmg = companyRegistry.find((record) => /毕马威/.test(record.name));
  assert.ok(kpmg?.sourceProviders.includes('moka'));
  const insta = companyRegistry.find((record) => /Insta360|影石/i.test(record.name));
  assert.ok(insta?.sourceProviders.includes('feishu'));
});
