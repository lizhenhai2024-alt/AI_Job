import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { keepOfficialJobs, isCategoryHeadingCompany, isTrustedUniversityOfficialBacked } from '../scripts/filter-official-live-jobs.mjs';

test('keepOfficialJobs removes unverified university/Nowcoder secondary records', () => {
  const jobs = [
    { id: 'a', sourceType: 'official', company: 'A' },
    { id: 'b', sourceType: 'secondary', company: 'B', sourceChannel: 'university' },
    { id: 'c', sourceType: 'secondary', company: 'C', sourceChannel: 'nowcoder' },
    { id: 'd', company: 'D' }
  ];
  assert.deepEqual(keepOfficialJobs(jobs).map((x) => x.id), ['a']);
});

test('trusted university record requires 2027 cohort plus explicit company career URL', () => {
  const trusted = {
    id: 'hnu-byd',
    sourceType: 'secondary',
    sourceChannel: 'university',
    graduationYear: '2027',
    officialCareerUrl: 'https://job.byd.com/',
    universitySource: { school: '湖南大学' }
  };
  assert.equal(isTrustedUniversityOfficialBacked(trusted), true);
  assert.deepEqual(keepOfficialJobs([trusted]).map((x) => x.id), ['hnu-byd']);
});

test('numbered section headings are rejected even when tagged official', () => {
  const pseudo = { id: 'pseudo', sourceType: 'official', company: '1.研发类单位' };
  assert.equal(isCategoryHeadingCompany(pseudo.company), true);
  assert.equal(keepOfficialJobs([pseudo]).length, 0);
});

test('scoped refresh bridges university discoveries before production filtering and rejects untrusted secondary rows', async () => {
  const source = await fs.readFile(new URL('../scripts/refresh-jobs-scoped.mjs', import.meta.url), 'utf8');
  const universityAt = source.indexOf("refresh-university-jobs.mjs");
  const bridgeAt = source.indexOf("university-official-bridge.mjs");
  const productionFilterAt = source.indexOf("filter-official-live-jobs.mjs");
  const compensationAt = source.indexOf("enrich-job-compensation.mjs");

  assert.ok(universityAt >= 0, 'university discovery step must remain available');
  assert.ok(bridgeAt > universityAt, 'university-to-official bridge must run after university discovery');
  assert.ok(productionFilterAt > bridgeAt, 'production source filter must run after bridge processing');
  assert.ok(compensationAt > productionFilterAt, 'compensation enrichment must run after source filtering');
  assert.match(source, /trustedUniversityOfficialBacked/);
  assert.match(source, /sourceType !== 'official' && !trustedUniversityOfficialBacked\(job\)/);
  assert.match(source, /source-policy-check/);
});
