import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupePreferOfficial,
  strongJobIdentity,
  weakJobDedupeKey
} from '../scripts/job-discovery/dedupe.mjs';

test('two official requisitions with same company title and city remain distinct', () => {
  const a = {
    id: 'a', company: '示例科技股份有限公司', title: '海外市场专员', city: '深圳',
    sourceType: 'official', source: '公司官方Moka校招官网',
    sourceUrl: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/10023'
  };
  const b = { ...a, id: 'b', sourceUrl: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/10497' };
  assert.equal(weakJobDedupeKey(a), weakJobDedupeKey(b));
  assert.notEqual(strongJobIdentity(a), strongJobIdentity(b));
  assert.equal(dedupePreferOfficial([a, b]).length, 2);
});

test('secondary record can merge into one unambiguous official requisition and preserve evidence', () => {
  const secondary = {
    id: 'secondary', company: '示例科技', title: '海外市场专员', city: '深圳',
    sourceType: 'secondary', source: '高校就业信息网', sourceUrl: 'https://career.example.edu/job/1'
  };
  const official = {
    id: 'official', company: '示例科技股份有限公司', title: '海外市场专员', city: '深圳',
    sourceType: 'official', source: '公司官方Moka校招官网',
    sourceUrl: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/10023'
  };
  const rows = dedupePreferOfficial([secondary, official]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'official');
  assert.ok(rows[0].sourceEvidence.some((row) => row.url === secondary.sourceUrl));
  assert.ok(rows[0].sourceEvidence.some((row) => row.url === official.sourceUrl));
});

test('ambiguous secondary row is not forced onto one of two distinct official requisitions', () => {
  const officialA = {
    id: 'a', company: '示例科技', title: '海外市场专员', city: '深圳', sourceType: 'official',
    sourceUrl: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/10023'
  };
  const officialB = { ...officialA, id: 'b', sourceUrl: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/10497' };
  const secondary = {
    id: 's', company: '示例科技', title: '海外市场专员', city: '深圳', sourceType: 'secondary',
    sourceUrl: 'https://career.example.edu/job/1'
  };
  assert.equal(dedupePreferOfficial([officialA, officialB, secondary]).length, 3);
});

test('Beisen UUID detail URL provides a stable strong identity', () => {
  const job = {
    sourceType: 'official', source: '公司官方北森校招官网',
    sourceUrl: 'https://demo.zhiye.com/campus/detail?jobAdId=87d80d00-993c-4fd3-a680-abc123456789'
  };
  assert.match(strongJobIdentity(job), /demo\.zhiye\.com\|87d80d00-993c-4fd3-a680-abc123456789/);
});
