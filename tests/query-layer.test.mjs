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

test('English alternatives do not become hard minor-language gates', () => {
  for (const description of [
    '英语或德语，可作为工作语言',
    '英语/日语可作为工作语言',
    '英语、法语任一可作为工作语言',
    '英语、日语、德语均可作为工作语言',
    '德语优先，英语可作为工作语言'
  ]) {
    const q = toQueryJob({ company: '示例', title: '岗位', description });
    assert.equal(q.language.minorLanguageRequired, false, description);
  }

  const bothRequired = toQueryJob({ company: '示例', title: '岗位', description: '要求英语和德语熟练' });
  assert.equal(bothRequired.language.minorLanguageRequired, true);

  const explicitGerman = toQueryJob({ company: '示例', title: '岗位', description: '德语必须，英语或法语优先' });
  assert.equal(explicitGerman.language.minorLanguageRequired, true);
});

test('related major is required unless the JD explicitly marks it preferred', () => {
  const required = toQueryJob({ company: '示例', title: '岗位A', major: '国际贸易相关专业' });
  const preferred = toQueryJob({ company: '示例', title: '岗位B', major: '国际贸易相关专业优先' });
  assert.equal(required.major.hardRestriction, true);
  assert.equal(preferred.major.hardRestriction, false);
});

test('open-major wording is not misclassified as a hard major gate', () => {
  for (const major of [
    '专业不限，计算机、软件工程、人工智能等相关专业优先',
    '专业基础：新闻传播，中文，社会学，理工科等专业不限',
    '专业不限，重要的是你用什么方法思考，而不是你学过什么专业',
    '计算机、数据科学、信息管理、统计、工商管理，或建筑、暖通、电气、安全等相关专业优先，认同行政专业工作的价值'
  ]) {
    const q = toQueryJob({ company: '示例', title: '岗位', major });
    assert.equal(q.major.hardRestriction, false, major);
  }
});

test('numbered section headings are not companies', () => {
  assert.equal(isCategoryHeadingCompany('1.研发类单位'), true);
  assert.equal(isCategoryHeadingCompany('2制造类单位'), true);
  assert.equal(isCategoryHeadingCompany('东风汽车集团有限公司'), false);
});


test('query layer excludes obvious professional and internship noise', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-job-query-scope-'));
  const manifest = await buildQueryLayer([
    { id: '1', company: '美团', title: '业务运营管理岗', sourceType: 'official' },
    { id: '2', company: '美团', title: '后端开发工程师', sourceType: 'official' },
    { id: '3', company: '美团', title: '市场运营实习生', sourceType: 'official' },
    { id: '4', company: '美团', title: '财务培训生', sourceType: 'official' },
    { id: '5', company: '美团', title: '【北斗】复杂Agent应用技术研究员', sourceType: 'official' },
    { id: '6', company: '美团', title: '【LongCat大模型人才校招】基础模型 - 预训练', sourceType: 'official' },
    { id: '7', company: '美团', title: '品牌/营销设计师', sourceType: 'official' },
    { id: '8', company: '美团', title: '大模型业务运营岗', sourceType: 'official' }
  ], { outputRoot: dir, updatedAt: '2026-09-19T00:00:00.000Z' });
  assert.equal(manifest.totalJobs, 2);
  const meituan = JSON.parse(await fs.readFile(path.join(dir, 'by-company', '美团.json'), 'utf8'));
  assert.deepEqual(meituan.jobs.map((job) => job.title), ['业务运营管理岗', '大模型业务运营岗']);
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
  const feed = JSON.parse(await fs.readFile(path.join(dir, 'index', 'careerpilot-feed.json'), 'utf8'));
  assert.equal(feed.totalJobs, 3);
  assert.equal(feed.jobs.length, 3);
  assert.equal('JD' in feed.jobs[0], false);
  assert.equal('jobDescription' in feed.jobs[0], false);
  assert.equal('jobRequirements' in feed.jobs[0], false);
});
