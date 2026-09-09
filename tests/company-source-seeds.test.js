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

  const miniso = companyRegistry.find((item) => item.name === '名创优品');
  assert.equal(miniso.careerUrlGraduationYear, '2027');
  assert.match(miniso.careerUrlCohortEvidence, /2027届校园招聘/);
});

test('user-provided recruitment URL overrides a curated seed and clears seed-only cohort evidence', () => {
  const registry = buildCompanyRegistry(
    [{ name: '测试公司', status: '主投', industries: [], cities: [], targetTracks: [], evidence: { count: 1 } }],
    [],
    [{ name: '测试公司', careerUrl: 'https://careers.example.com/user-campus', requestedAt: '2026-09-09T00:00:00Z', status: '待分析' }],
    [],
    { companies: [] },
    [{ company: '测试公司', url: 'https://careers.example.com/seed', note: 'seed', graduationYear: '2027', cohortEvidence: '测试公司2027届校园招聘', verifiedAt: '2026-09-09' }]
  );
  assert.equal(registry[0].careerUrl, 'https://careers.example.com/user-campus');
  assert.equal(registry[0].careerUrlSeeded, false);
  assert.equal(registry[0].careerUrlGraduationYear, '');
  assert.equal(registry[0].careerUrlCohortEvidence, '');
});

test('seeded unmanaged companies are prioritized and carry deterministic URL plus verified evidence into discovery', () => {
  const records = [
    {
      name: '有种子', status: '主投', sourceManaged: false, careerUrl: 'https://careers.example.com/campus',
      careerUrlSeeded: true, careerUrlGraduationYear: '2027', careerUrlCohortEvidence: '有种子2027届校园招聘', evidence: { count: 0 }
    },
    { name: '无种子', status: '主投', sourceManaged: false, evidence: { count: 8 } }
  ];
  const queue = buildDiscoveryQueue(records, { companies: {} }, { limit: 2, now: new Date('2026-09-09T00:00:00Z') });
  assert.equal(queue[0].name, '有种子');
  assert.equal(queue[0].careerUrl, 'https://careers.example.com/campus');
  assert.equal(queue[0].careerUrlSeeded, true);
  assert.equal(queue[0].careerUrlGraduationYear, '2027');
  assert.equal(queue[0].careerUrlCohortEvidence, '有种子2027届校园招聘');
});

test('seed registry contains unique HTTPS URLs and explicit evidence for structured 2027 seeds', () => {
  assert.ok(companySourceSeeds.length > 0);
  assert.equal(new Set(companySourceSeeds.map((item) => item.company)).size, companySourceSeeds.length);
  assert.equal(new Set(companySourceSeeds.map((item) => item.url)).size, companySourceSeeds.length);
  assert.equal(companySourceSeeds.every((item) => /^https:\/\//.test(item.url)), true);
  const cohortSeeds = companySourceSeeds.filter((item) => item.graduationYear === '2027');
  assert.ok(cohortSeeds.length >= 4);
  assert.equal(cohortSeeds.every((item) => /2027届|27届/.test(item.cohortEvidence || '') && item.verifiedAt), true);
});
