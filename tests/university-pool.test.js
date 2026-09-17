import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUniversityPool,
  isPublishableUniversityRecord,
  selectUniversityPoolSources,
  universityPoolType,
} from '../scripts/refresh-university-pool.mjs';

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
  assert.equal(isPublishableUniversityRecord({ company: '示例科技有限公司', title: '海外业务培训生' }), true);
});

test('dedicated pool keeps university provenance and drops obvious professional roles before CareerPilot', async () => {
  const pages = new Map([
    ['https://a.edu/list', '<a href="/job1">某消费科技公司2027届校园招聘</a><a href="/job2">某科技公司2027届校园招聘</a>'],
    ['https://a.edu/job1', '<html><h1>某消费科技公司2027届校园招聘</h1><body>用人单位：某消费科技公司\n招聘岗位：海外市场\n2027届本科及以上，专业不限，英语可作为工作语言。工作地点：深圳。页面历史：2014年、2026年。</body></html>'],
    ['https://a.edu/job2', '<html><h1>某科技公司2027届软件工程师校园招聘</h1><body>用人单位：某科技公司\n2027届本科及以上，计算机相关专业。岗位：软件工程师。</body></html>'],
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
  assert.ok(result.jobs.every((x) => x.jobDescription.includes('2027届')));
  assert.ok(result.jobs.every((x) => JSON.stringify(x.graduationYear) === JSON.stringify(['2027'])));
});
