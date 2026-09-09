import test from 'node:test';
import assert from 'node:assert/strict';
import { companyRegistry, buildCompanyRegistry } from '../src/data/company-registry.js';
import { companySourceSeeds } from '../src/data/company-source-seeds.js';
import { buildDiscoveryQueue } from '../scripts/job-discovery/source-candidates.mjs';

test('verified recruitment seeds attach to existing company-registry records without approving a source', () => {
  for (const name of ['腾讯', '拼多多', '名创优品', '致欧家居']) {
    const record = companyRegistry.find((item) => item.name === name);
    assert.ok(record, `${name} should exist in company registry`);
    assert.match(record.careerUrl || '', /^https:\/\//);
    assert.equal(record.careerUrlSeeded, true);
  }
  const tencent = companyRegistry.find((item) => item.name === '腾讯');
  assert.equal(tencent.sourceManaged, false, 'a curated seed must not become an approved source by itself');
});

test('user-provided recruitment URL overrides a curated seed', () => {
  const registry = buildCompanyRegistry(
    [{ name: '测试公司', status: '主投', industries: [], cities: [], targetTracks: [], evidence: { count: 1 } }],
    [],
    [{ name: '测试公司', careerUrl: 'https://careers.example.com/user-campus', requestedAt: '2026-09-09T00:00:00Z', status: '待分析' }],
    [],
    { companies: [] },
    [{ company: '测试公司', url: 'https://careers.example.com/seed', note: 'seed', verifiedAt: '2026-09-09' }]
  );
  assert.equal(registry[0].careerUrl, 'https://careers.example.com/user-campus');
  assert.equal(registry[0].careerUrlSeeded, false);
});

test('seeded unmanaged companies are prioritized and enter discovery with their deterministic URL', () => {
  const records = [
    { name: '有种子', status: '主投', sourceManaged: false, careerUrl: 'https://careers.example.com/campus', evidence: { count: 0 } },
    { name: '无种子', status: '主投', sourceManaged: false, evidence: { count: 8 } }
  ];
  const queue = buildDiscoveryQueue(records, { companies: {} }, { limit: 2, now: new Date('2026-09-09T00:00:00Z') });
  assert.equal(queue[0].name, '有种子');
  assert.equal(queue[0].careerUrl, 'https://careers.example.com/campus');
});

test('seed registry contains unique HTTPS URLs and company names', () => {
  assert.ok(companySourceSeeds.length > 0);
  assert.equal(new Set(companySourceSeeds.map((item) => item.company)).size, companySourceSeeds.length);
  assert.equal(new Set(companySourceSeeds.map((item) => item.url)).size, companySourceSeeds.length);
  assert.equal(companySourceSeeds.every((item) => /^https:\/\//.test(item.url)), true);
});
