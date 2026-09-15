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

test('Fuyao-like records are normalized only from their actual source evidence', () => {
  const jobs = curateJobGranularity({
    id: 'fuyao-raw',
    company: '福耀玻璃',
    title: '销售跟单(2027届,外语类/国贸类)',
    graduationYear: '2027',
    roleFamily: ['其他'],
    sourceType: 'secondary',
    sourceUrl: 'https://example.com/secondary',
    city: '福清'
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, '销售跟单');
  assert.equal(jobs[0].city, '福清');
  assert.equal(jobs[0].sourceType, 'secondary');
  assert.equal(jobs[0].sourceUrl, 'https://example.com/secondary');
  assert.deepEqual(jobs[0].majorRequirements, ['外语类', '国贸类']);
});

test('source code does not inject deterministic current jobs when discovery misses', () => {
  assert.deepEqual(curatedOfficialGranularityJobs(), []);
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

test('withholds high-confidence official multi-role aggregates pending concrete job resolution', () => {
  const input = {
    id: 'bulk-official',
    company: '示例集团',
    title: '销售跟单/业务运营/市场专员',
    graduationYear: '2027',
    sourceType: 'official'
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
