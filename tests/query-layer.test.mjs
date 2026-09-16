import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildQueryLayer, isCategoryHeadingCompany, slugifyCompany, toQueryJob } from '../scripts/build-query-layer.mjs';

test('slugifyCompany produces stable lightweight filenames', () => {
  assert.equal(slugifyCompany('Hisense 海信集团'), 'hisense-海信');
  assert.equal(slugifyCompany('OPPO'), 'oppo');
});

test('query job exposes executable eligibility fields without inventing fit scores', () => {
  const q = toQueryJob({
    id: 'x1', company: '海信', title: '海外营销', graduationYear: '2027届',
    education: '本科及以上', major: '专业不限，英语专业优先', languages: ['英语'], city: '青岛',
    description: '英语可作为工作语言', sourceType: 'official', sourceUrl: 'https://example.com/job/1', publishedAt: '2026-09-16'
  });
  assert.deepEqual(q.graduationYear, ['2027']);
  assert.equal(q.education.min, '本科');
  assert.equal(q.education.masterRequired, false);
  assert.equal(q.major.hardRestriction, false);
  assert.equal(q.language.english, true);
  assert.equal(q.language.minorLanguageRequired, false);
  assert.equal('matchScore' in q, false);
  assert.equal(q.officialURL, 'https://example.com/job/1');
});

test('hard master and required minor-language gates are machine-readable', () => {
  const q = toQueryJob({ company: '示例', title: '岗位', education: '硕士及以上', major: '国际贸易相关专业', description: '要求德语熟练，可作为工作语言' });
  assert.equal(q.education.masterRequired, true);
  assert.equal(q.major.hardRestriction, true);
  assert.equal(q.language.minorLanguageRequired, true);
});

test('related major is required unless the JD explicitly marks it preferred', () => {
  const required = toQueryJob({ company: '示例', title: '岗位A', major: '国际贸易相关专业' });
  const preferred = toQueryJob({ company: '示例', title: '岗位B', major: '国际贸易相关专业优先' });
  assert.equal(required.major.hardRestriction, true);
  assert.equal(preferred.major.hardRestriction, false);
});

test('numbered section headings are not companies', () => {
  assert.equal(isCategoryHeadingCompany('1.研发类单位'), true);
  assert.equal(isCategoryHeadingCompany('2制造类单位'), true);
  assert.equal(isCategoryHeadingCompany('东风汽车集团有限公司'), false);
});

test('buildQueryLayer writes company shards and manifest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-job-query-'));
  const manifest = await buildQueryLayer([
    { id: '1', company: '海信', title: '岗位A' },
    { id: '2', company: '海信', title: '岗位B' },
    { id: '3', company: 'OPPO', title: '岗位C' },
    { id: '4', company: '1.研发类单位', title: '不应进入索引' }
  ], { outputRoot: dir, updatedAt: '2026-09-16T00:00:00.000Z' });
  assert.equal(manifest.totalJobs, 3);
  assert.equal(manifest.totalCompanies, 2);
  const hisense = JSON.parse(await fs.readFile(path.join(dir, 'by-company', '海信.json'), 'utf8'));
  assert.equal(hisense.count, 2);
  const index = JSON.parse(await fs.readFile(path.join(dir, 'index', 'companies.json'), 'utf8'));
  assert.equal(index.companies.length, 2);
  assert.equal(index.companies.some((item) => item.company === '1.研发类单位'), false);
});
