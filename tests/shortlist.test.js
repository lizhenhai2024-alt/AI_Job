import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyShortlist, dailyShortlistStats } from '../src/core/shortlist.js';

function job(id, { tier = 'A', score = 75, priority = '可以投', official = true, gate = true, visible = true, status = '推荐', quality = 8, publishedAt = '2026-09-09' } = {}) {
  return {
    id,
    company: `Company ${id}`,
    title: `Job ${id}`,
    status,
    sourceType: official ? 'official' : 'secondary',
    verification: official ? '官方招聘官网' : '二手来源，待官网核验',
    publishedAt,
    match: {
      tier,
      score,
      priority,
      gate: { passed: gate },
      visibleByDefault: visible,
      breakdown: { quality: { score: quality, max: 10 } }
    }
  };
}

test('daily shortlist caps at 20 and prioritizes S/A before B', () => {
  const jobs = [
    ...Array.from({ length: 5 }, (_, i) => job(`s${i}`, { tier: 'S', score: 90 - i, priority: '优先投' })),
    ...Array.from({ length: 20 }, (_, i) => job(`a${i}`, { tier: 'A', score: 80 - i / 10 })),
    ...Array.from({ length: 10 }, (_, i) => job(`b${i}`, { tier: 'B', score: 65 - i / 10, priority: '机会型' }))
  ];
  const shortlist = buildDailyShortlist(jobs);
  assert.equal(shortlist.length, 20);
  assert.equal(shortlist.some((item) => item.match.tier === 'B'), false);
  assert.equal(shortlist.slice(0, 5).every((item) => item.match.tier === 'S'), true);
});

test('daily shortlist fills with B opportunities only when S/A count is below 10', () => {
  const jobs = [
    ...Array.from({ length: 2 }, (_, i) => job(`s${i}`, { tier: 'S', score: 90 - i, priority: '优先投' })),
    ...Array.from({ length: 4 }, (_, i) => job(`a${i}`, { tier: 'A', score: 78 - i })),
    ...Array.from({ length: 10 }, (_, i) => job(`b${i}`, { tier: 'B', score: 66 - i, priority: '机会型' }))
  ];
  const shortlist = buildDailyShortlist(jobs);
  assert.equal(shortlist.length, 10);
  assert.equal(shortlist.filter((item) => item.match.tier === 'B').length, 4);
});

test('daily shortlist never pads with failed gates or hidden sub-55 jobs', () => {
  const jobs = [
    job('good-a', { tier: 'A', score: 72 }),
    job('good-b', { tier: 'B', score: 58, priority: '机会型' }),
    job('blocked', { tier: 'A', score: 90, gate: false }),
    job('hidden', { tier: 'A', score: 90, visible: false }),
    job('low', { tier: 'B', score: 54, priority: '机会型' })
  ];
  const shortlist = buildDailyShortlist(jobs);
  assert.deepEqual(shortlist.map((item) => item.id), ['good-a', 'good-b']);
});

test('already applied/interview/offer/rejected jobs do not reappear in daily application list', () => {
  const statuses = ['已投递', '面试', 'Offer', '淘汰'];
  const jobs = [job('recommend'), job('saved', { status: '已收藏' }), ...statuses.map((status, i) => job(`done${i}`, { status }))];
  const shortlist = buildDailyShortlist(jobs);
  assert.deepEqual(shortlist.map((item) => item.id), ['recommend', 'saved']);
});

test('source quality breaks equal-score ties without excluding secondary-source A jobs', () => {
  const jobs = [
    job('secondary', { official: false, quality: 6, score: 74 }),
    job('official', { official: true, quality: 10, score: 74 })
  ];
  const shortlist = buildDailyShortlist(jobs);
  assert.deepEqual(shortlist.map((item) => item.id), ['official', 'secondary']);
  assert.equal(shortlist[1].sourceType, 'secondary');
});

test('daily shortlist stats expose official vs needs-verification counts', () => {
  const jobs = [
    job('s', { tier: 'S', score: 88, priority: '优先投', official: true }),
    job('a1', { tier: 'A', score: 76, official: true }),
    job('a2', { tier: 'A', score: 74, official: false })
  ];
  const stats = dailyShortlistStats(jobs);
  assert.deepEqual(stats, { total: 3, s: 1, a: 2, b: 0, official: 2, needsVerification: 1 });
});

test('custom min/max stay bounded to the product limit of 20', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job(`a${i}`, { score: 90 - i / 10 }));
  assert.equal(buildDailyShortlist(jobs, { min: 5, max: 12 }).length, 12);
  assert.equal(buildDailyShortlist(jobs, { min: 30, max: 50 }).length, 20);
});
