import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildUniversityPool,
  buildUniversitySourceHealth,
  filterLegacyUniversityJobs,
  isPublishableUniversityRecord,
  selectUniversityPoolSources,
  universityPoolType,
} from '../scripts/refresh-university-pool.mjs';
import { parseUniversityJobPage } from '../scripts/job-discovery/university.mjs';

const config = {
  schools: [
    { school: 'A大学', segments: ['985', '211', '双一流'], priority: 100, enabled: true, listUrls: ['https://a.edu/list'], maxLinks: 20 },
    { school: 'B大学', segments: ['211', '双一流'], priority: 90, enabled: true, listUrls: ['https://b.edu/list'], maxLinks: 20 },
    { school: 'C外国语大学', segments: ['外语外贸特色高校'], priority: 120, enabled: true, listUrls: ['https://c.edu/list'], maxLinks: 20 },
    { school: 'D普通大学', segments: [], priority: 130, enabled: true, listUrls: ['https://d.edu/list'], maxLinks: 20 },
  ],
};

test('pool type and deterministic source selection keep elite/specialty groups separate from ordinary schools', () => {
  assert.deepEqual(universityPoolType(config.schools[0]), { elite: true, specialty: false });
  assert.deepEqual(universityPoolType(config.schools[2]), { elite: false, specialty: true });
  const rows = selectUniversityPoolSources(config, { eliteMaxSchools: 1, specialtyMaxSchools: 1, maxLinksPerSchool: 12 });
  assert.deepEqual(rows.map((x) => x.school), ['A大学', 'C外国语大学']);
  assert.ok(rows.every((x) => x.maxLinks === 12));
});

test('publisher rejects obvious policy prose and page-section headings without asking an LLM', () => {
  assert.equal(isPublishableUniversityRecord({
    company: '为全面落实党中央、国务院对毕业生就业工作的决策部署，推动人才供需精准对接',
    title: '办公地址',
  }), false);
  assert.equal(isPublishableUniversityRecord({ company: '示例科技有限公司', title: '联系方式' }), false);
  assert.equal(isPublishableUniversityRecord({
    company: '国际关系学院举办',
    title: '国际关系学院举办2027届毕业生就业动员大会',
  }), false);
  assert.equal(isPublishableUniversityRecord({ company: '示例科技有限公司', title: '海外业务培训生' }), true);
});


test('cached fallback is revalidated so old employment news cannot survive a new filter', () => {
  const jobs = filterLegacyUniversityJobs([
    { company: '国际关系学院举办', title: '国际关系学院举办2027届毕业生就业动员大会' },
    { company: '示例科技有限公司', title: '2027届海外业务培训生' },
  ]);
  assert.deepEqual(jobs.map((x) => x.company), ['示例科技有限公司']);
});



test('GDUFS source uses the live job list and job detail pattern', () => {
  const sourceConfig = JSON.parse(fs.readFileSync('config/university-sources.json', 'utf8'));
  const source = sourceConfig.schools.find((x) => x.school === '广东外语外贸大学');
  assert.deepEqual(source.listUrls, ['https://career.gdufs.edu.cn/web/Index/job-list']);
  assert.equal(source.detailUrlPattern, '/web/Index/job-detail');
  assert.equal(source.apiCohort, '2027');
});

test('university job detail extracts employer from Enterprise Info section', () => {
  const job = parseUniversityJobPage({
    html: '<html><h1>海外销售</h1><body><div>企业信息</div><div>Company Info</div><h4>得力集团有限公司</h4><div>岗位要求：英语CET6及以上。工作地点：深圳。</div></body></html>',
    url: 'https://career.gdufs.edu.cn/web/Index/job-detail?id=11133',
    source: { school: '广东外语外贸大学', apiCohort: '2027', listUrls: ['https://career.gdufs.edu.cn/web/Index/job-list'] },
    now: new Date('2026-09-22T00:00:00Z'),
  });
  assert.equal(job.company, '得力集团有限公司');
  assert.equal(job.title, '海外销售');
  assert.equal(job.graduationYear, '2027');
  assert.deepEqual(job.languages, ['英语']);
});


test('dedicated pool keeps university provenance, drops professional roles, and quarantines bundled recruitment briefs', async () => {
  const pages = new Map([
    ['https://a.edu/list', '<a href="/job1">某消费科技公司2027届校园招聘</a><a href="/job2">某科技公司2027届校园招聘</a><a href="/job4">某银行2027届秋季校园招聘</a>'],
    ['https://a.edu/job1', '<html><h1>某消费科技公司2027届校园招聘</h1><body>用人单位：某消费科技公司\n招聘岗位：海外市场\n2027届本科及以上，专业不限，英语可作为工作语言。工作地点：深圳。页面历史：2014年、2026年。</body></html>'],
    ['https://a.edu/job2', '<html><h1>某科技公司2027届软件工程师校园招聘</h1><body>用人单位：某科技公司\n2027届本科及以上，计算机相关专业。岗位：软件工程师。</body></html>'],
    ['https://a.edu/job4', '<html><h1>某银行2027届秋季校园招聘</h1><body>用人单位：某银行\n岗位名称 工作地点 岗位职责 教育背景要求\n定向培养生 长沙\n信息技术岗 长沙\n公司市场营销岗 长沙\n零售市场营销岗 长沙\n运营柜员岗 长沙\n2027届本科及以上。单位所在地：湖南省长沙市。</body></html>'],
    ['https://c.edu/list', '<a href="/job3">某品牌公司2027届校园招聘</a>'],
    ['https://c.edu/job3', '<html><h1>某品牌公司2027届校园招聘</h1><body>用人单位：某品牌公司\n岗位：国际品牌运营\n2027届本科及以上，英语、市场营销相关专业优先。</body></html>'],
  ]);
  const fetcher = async (url) => {
    if (!pages.has(url)) throw new Error(`missing fixture ${url}`);
    return pages.get(url);
  };
  const result = await buildUniversityPool({
    profile: { graduationYear: '2027' },
    config,
    fetcher,
    eliteMaxSchools: 1,
    specialtyMaxSchools: 1,
    maxLinksPerSchool: 10,
    concurrency: 2,
    now: new Date('2026-09-17T00:00:00Z'),
  });
  assert.equal(result.jobs.length, 2);
  assert.ok(result.jobs.every((x) => x.sourcePool === 'university-employment'));
  assert.ok(result.jobs.every((x) => x.sourceChannel === 'university'));
  assert.ok(result.jobs.some((x) => x.universitySchool === 'A大学' && x.universityElite));
  assert.ok(result.jobs.some((x) => x.universitySchool === 'C外国语大学' && x.universitySpecialty));
  assert.ok(result.jobs.every((x) => !/软件工程师/.test(x.title)));
  assert.ok(result.jobs.every((x) => !/某银行2027届秋季校园招聘/.test(x.title)));
  assert.ok(result.jobs.every((x) => x.jobDescription.includes('2027届')));
  assert.ok(result.jobs.every((x) => JSON.stringify(x.graduationYear) === JSON.stringify(['2027'])));
});


test('source health distinguishes current success, zero/error, and cached fallback', () => {
  const updatedAt = '2026-09-22T05:00:00.000Z';
  const sources = [
    { school: '成功大学', segments: ['双一流'], priority: 100, listUrls: ['https://ok.edu/list'] },
    { school: '空结果大学', segments: ['双一流'], priority: 90, listUrls: ['https://zero.edu/list'] },
    { school: '失败大学', segments: ['外语外贸特色高校'], priority: 80, listUrls: ['https://error.edu/list'] },
    { school: '缓存大学', segments: ['外语外贸特色高校'], priority: 70, listUrls: ['https://cached.edu/list'] },
  ];
  const result = {
    sources,
    jobs: [{ universitySchool: '成功大学' }],
    stats: {
      perPortal: {
        成功大学: { listed: 3, detailed: 3, keptJobs: 1, errors: 0, listPages: 1 },
        空结果大学: { listed: 0, detailed: 0, keptJobs: 0, errors: 0, listPages: 1 },
        失败大学: { listed: 0, detailed: 0, keptJobs: 0, errors: 1, lastError: 'HTTP 403 for https://error.edu/list', listPages: 1 },
        缓存大学: { listed: 0, detailed: 0, keptJobs: 0, errors: 1, listPages: 1 },
      },
    },
  };
  const legacy = new Map([
    ['缓存大学', { jobs: [{ title: '旧岗位' }], updatedAt: '2026-09-21T05:00:00.000Z' }],
  ]);
  const health = buildUniversitySourceHealth(result, updatedAt, legacy);
  assert.equal(health.totalSchools, 4);
  assert.deepEqual(health.statusCounts, { OK: 1, ZERO: 1, ERROR: 1, CACHED: 1 });
  assert.equal(health.schools.find((x) => x.school === '成功大学').lastSuccess, updatedAt);
  assert.equal(health.schools.find((x) => x.school === '缓存大学').cachedJobs, 1);
  assert.equal(health.schools.find((x) => x.school === '缓存大学').lastSuccess, '2026-09-21T05:00:00.000Z');
  assert.equal(health.schools.find((x) => x.school === '失败大学').status, 'ERROR');
  assert.equal(health.schools.find((x) => x.school === '失败大学').lastError, 'HTTP 403 for https://error.edu/list');
});
