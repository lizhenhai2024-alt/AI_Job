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
  assert.deepEqual([...normalizeCities(['上海/北京 有office', '品牌市场/HR/运营'])].sort(), ['上海', '北京'].sort());
  assert.deepEqual(normalizeTracks([], ['上海/北京 有office', '品牌市场/HR/运营']), ['品牌市场', 'HR', '运营']);
  for (const record of companyRegistry) {
    assert.equal((record.cities || []).some((value) => /市场|营销|HR|运营|商务|供应链|客户|产品/i.test(value)), false, `${record.name} has track data in cities`);
  }
});

test('all official source entries are represented in the unified company registry', () => {
  assert.ok(sourceRegistry.length > 0, 'official source registry should not be empty');
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
  const nestle = companyRegistry.find((record) => /雀巢/.test(record.name));
  assert.ok(nestle?.sourceProviders.includes('moka'));
  const insta = companyRegistry.find((record) => /Insta360|影石/i.test(record.name));
  assert.ok(insta?.sourceProviders.includes('feishu'));
});


test('JD.com and Insta360 are first-class companies with stable aliases', () => {
  const jd = companyRegistry.find((record) => record.name === '京东');
  assert.ok(jd, '京东 should exist in company registry');
  assert.equal(jd.status, '主投');
  assert.match(jd.careerUrl || '', /campus\.jd\.com/);
  assert.equal(canonicalCompanyKey('JD.com'), canonicalCompanyKey('京东'));
  assert.equal(canonicalCompanyKey('JD'), canonicalCompanyKey('京东'));

  const insta = companyRegistry.find((record) => /影石.*Insta360/i.test(record.name));
  assert.ok(insta, '影石Insta360 should exist in company registry');
  assert.equal(insta.status, '主投');
  assert.ok(insta.sourceProviders.includes('feishu'));
  assert.match(insta.careerUrl || '', /insta360\.zhiye\.com\/Campus/i);
  assert.equal(canonicalCompanyKey('Insta360'), canonicalCompanyKey('影石'));
  assert.equal(canonicalCompanyKey('影石科技'), canonicalCompanyKey('影石Insta360'));
});


test('application companies are first-class records and parent brands do not swallow exact sub-brands', () => {
  for (const name of ['4399游戏', '图拉斯', '阿里巴巴千问办公']) {
    const record = companyRegistry.find((item) => item.name === name);
    assert.ok(record, `${name} should exist in company registry`);
    assert.equal(record.status, '主投');
  }
  assert.equal(canonicalCompanyKey('4399'), canonicalCompanyKey('4399游戏'));
  assert.equal(canonicalCompanyKey('TORRAS'), canonicalCompanyKey('图拉斯'));
  assert.equal(canonicalCompanyKey('千问办公'), canonicalCompanyKey('阿里巴巴千问办公'));
  assert.equal(canonicalCompanyKey('TCL华星'), canonicalCompanyKey('TCL华星光电'));

  const qwen = companyRegistry.find((item) => item.name === '阿里巴巴千问办公');
  const alibaba = companyRegistry.find((item) => item.name === '阿里巴巴');
  assert.ok(qwen && alibaba);
  assert.notEqual(canonicalCompanyKey(qwen.name), canonicalCompanyKey(alibaba.name));
});
