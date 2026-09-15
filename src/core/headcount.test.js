import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeadcount, normalizePublishedAt, enrichJobHeadcount } from './headcount.js';

test('structured official HeadCount is retained as job-level HC', () => {
  const x = normalizeHeadcount({ sourceType: 'official', HeadCount: 5 });
  assert.equal(x.disclosed, true);
  assert.equal(x.min, 5);
  assert.equal(x.max, 5);
  assert.equal(x.scope, 'job');
  assert.equal(x.display, '5人');
  assert.equal(x.confidence, 'high');
});

test('explicit JD headcount range is parsed', () => {
  const x = normalizeHeadcount({ sourceType: 'official', jobDescription: '岗位招聘人数：3-5人，负责海外市场项目。' });
  assert.equal(x.disclosed, true);
  assert.equal(x.min, 3);
  assert.equal(x.max, 5);
  assert.equal(x.scope, 'job');
  assert.equal(x.display, '3–5人');
});

test('campus-wide hiring plan is marked as program scope, not exact job HC', () => {
  const x = normalizeHeadcount({ sourceType: 'official', description: '2027届校园招聘计划招聘1000人，覆盖研发、市场、运营等岗位。' });
  assert.equal(x.disclosed, true);
  assert.equal(x.min, 1000);
  assert.equal(x.scope, 'program');
});

test('company employee size is not mistaken for hiring HC', () => {
  const x = normalizeHeadcount({ sourceType: 'official', description: '公司现有员工5000人，业务遍布全球。' });
  assert.equal(x.disclosed, false);
  assert.equal(x.display, '未披露');
});

test('publication date never falls back to discoveredAt', () => {
  assert.equal(normalizePublishedAt({ discoveredAt: '2026-09-15T10:30:00Z' }), '');
  assert.equal(normalizePublishedAt({ datePosted: '2026/09/14', discoveredAt: '2026-09-15T10:30:00Z' }), '2026-09-14');
});

test('enrichment preserves normalized publication and compatibility fields', () => {
  const x = enrichJobHeadcount({ sourceType: 'official', publishedAt: '2026年9月13日', headcountRaw: '2人' });
  assert.equal(x.publishedAt, '2026-09-13');
  assert.equal(x.headcountDisplay, '2人');
  assert.equal(x.headcountScope, 'job');
});
