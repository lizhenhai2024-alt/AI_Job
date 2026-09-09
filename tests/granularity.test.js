import test from 'node:test';
import assert from 'node:assert/strict';
import {
  curateJobGranularity,
  curatedOfficialGranularityJobs,
  isHighConfidenceMergedPosting,
  separateTitleFromQualifications
} from '../scripts/job-discovery/granularity.mjs';

test('separates cohort and major requirements from a job title', () => {
  const job = separateTitleFromQualifications({
    id: 'x1',
    company: '示例公司',
    title: '销售跟单(2027届,外语类/国贸类)',
    graduationYear: '2027',
    sourceType: 'secondary'
  });
  assert.equal(job.title, '销售跟单');
  assert.deepEqual(job.majorRequirements, ['外语类', '国贸类']);
});

test('resolves Fuyao sales follow-up into city-specific official cards', () => {
  const jobs = curateJobGranularity({
    id: 'fuyao-raw',
    company: '福耀玻璃',
    title: '销售跟单(2027届,外语类/国贸类)',
    graduationYear: '2027',
    roleFamily: ['其他'],
    skills: [],
    languages: [],
    experienceKeywords: [],
    preferenceTags: [],
    sourceType: 'secondary',
    sourceUrl: 'https://example.com/secondary'
  });
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((job) => job.city), ['福清', '合肥']);
  assert.deepEqual(jobs.map((job) => job.title), [
    '销售跟单-2027届校招-福清',
    '销售跟单-2027届校招-合肥'
  ]);
  for (const job of jobs) {
    assert.equal(job.sourceType, 'official');
    assert.equal(job.sourceUrl, 'https://job.fuyaogroup.com/');
    assert.deepEqual(job.majorRequirements, ['外语类', '国贸类', '机械类', '材料类']);
    assert.equal(job.granularityStatus, 'officially_resolved');
  }
});

test('verified Fuyao concrete cards are deterministic even when discovery misses the secondary row', () => {
  const jobs = curatedOfficialGranularityJobs();
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((job) => job.title), [
    '销售跟单-2027届校招-福清',
    '销售跟单-2027届校招-合肥'
  ]);
  assert.ok(jobs.every((job) => job.sourceType === 'official'));
  assert.ok(jobs.every((job) => job.granularityStatus === 'officially_resolved'));
  assert.ok(jobs.every((job) => /专业要求/.test(job.description)));
});

test('withholds high-confidence secondary multi-role aggregates pending official resolution', () => {
  const input = {
    id: 'bulk1',
    company: '示例集团',
    title: '销售跟单/业务运营/市场专员',
    graduationYear: '2027',
    sourceType: 'secondary'
  };
  assert.equal(isHighConfidenceMergedPosting(input), true);
  const [job] = curateJobGranularity(input);
  assert.equal(job.excludeFromLiveBoard, true);
  assert.equal(job.granularityStatus, 'needs_official_resolution');
});

test('does not mistake a cohort-only suffix for a major requirement block', () => {
  const original = {
    id: 'x2',
    company: '示例公司',
    title: '国际销售跟单（英）（2027届）',
    graduationYear: '2027',
    sourceType: 'secondary'
  };
  const job = separateTitleFromQualifications(original);
  assert.equal(job.title, original.title);
  assert.equal(job.majorRequirements, undefined);
});
