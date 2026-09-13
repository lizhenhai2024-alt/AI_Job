import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { keepOfficialJobs } from '../scripts/filter-official-live-jobs.mjs';

test('keepOfficialJobs removes university/Nowcoder secondary records', () => {
  const jobs = [
    { id: 'a', sourceType: 'official', company: 'A' },
    { id: 'b', sourceType: 'secondary', company: 'B', sourceChannel: 'university' },
    { id: 'c', sourceType: 'secondary', company: 'C', sourceChannel: 'nowcoder' },
    { id: 'd', company: 'D' }
  ];
  assert.deepEqual(keepOfficialJobs(jobs).map((x) => x.id), ['a']);
});

test('scoped refresh filters secondary discovery before compensation and validates the final pool', async () => {
  const source = await fs.readFile(new URL('../scripts/refresh-jobs-scoped.mjs', import.meta.url), 'utf8');
  const universityAt = source.indexOf("refresh-university-jobs.mjs");
  const officialAt = source.indexOf("filter-official-live-jobs.mjs");
  const compensationAt = source.indexOf("enrich-job-compensation.mjs");

  assert.ok(universityAt >= 0, 'university discovery step must remain available');
  assert.ok(officialAt > universityAt, 'official-only filter must run after university discovery');
  assert.ok(compensationAt > officialAt, 'compensation enrichment must run after source filtering');
  assert.match(source, /some\(\(job\) => job\?\.sourceType !== 'official'\)/);
  assert.match(source, /source-policy-check/);
});
