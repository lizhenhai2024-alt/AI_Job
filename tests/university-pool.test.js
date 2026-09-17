import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUniversityPool,
  classifyUniversityRecord,
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

test('recruitment brief is held while concrete role title is decision eligible', () => {
  assert.deepEqual(classifyUniversityRecord({ title: '某集团2027届校园招聘简章' }), {
    recordType: 'recruitment_brief',
    decisionEligible: false,
    decisionHoldReason: '高校就业网招聘简章/公司级公告，不把整页多岗位内容当成一个岗位评分',
  });
  assert.equal(classifyUniversityRecord({ title: '海外市场专员（2027届校园招聘）' }).decisionEligible, true);
  assert.equal(classifyUniversityRecord({ title: '软件工程师-2027届校招' }).decisionEligible, true);
  assert.equal(classifyUniversityRecord({
    title: '销售/研发/财务岗位汇总', granularityStatus: 'needs_official_resolution',
  }).decisionEligible, false);
});

test('dedicated pool preserves briefs as evidence but only sends concrete non-professional roles to decision pool', async () => {
  const pages = new Map([
    ['https://a.edu/list', '<a href="/brief">某消费科技公司2027届校园招聘</a><a href="/job1">海外市场专员2027届校园招聘</a><a href="/job2">软件工程师2027届校园招聘</a>'],
    ['https://a.edu/brief', '<html><h1>某消费科技公司2027届校园招聘</h1><body>用人单位：某消费科技公司\n招聘岗位：海外市场、软件工程师、财务分析\n2027届本科及以上，专业不限。工作地点：深圳。</body></html>'],
    ['https://a.edu/job1', '<html><h1>海外市场专员2027届校园招聘</h1><body>用人单位：某消费科技公司\n岗位：海外市场专员\n2027届本科及以上，专业不限，英语可作为工作语言。工作地点：深圳。</body></html>'],
    ['https://a.edu/job2', '<html><h1>软件工程师2027届校园招聘</h1><body>用人单位：某科技公司\n2027届本科及以上，计算机相关专业。岗位：软件工程师。</body></html>'],
    ['https://c.edu/list', '<a href="/job3">国际品牌运营2027届校园招聘</a>'],
    ['https://c.edu/job3', '<html><h1>国际品牌运营2027届校园招聘</h1><body>用人单位：某品牌公司\n岗位：国际品牌运营\n2027届本科及以上，英语、市场营销相关专业优先。</body></html>'],
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
  assert.equal(result.briefs.length, 1);
  assert.equal(result.briefs[0].universityRecordType, 'recruitment_brief');
  assert.equal(result.briefs[0].decisionEligible, false);
  assert.equal(result.decisionJobs.length, 2);
  assert.ok(result.decisionJobs.some((x) => /海外市场/.test(x.title)));
  assert.ok(result.decisionJobs.some((x) => /国际品牌运营/.test(x.title)));
  assert.ok(result.decisionJobs.every((x) => x.decisionEligible));
  assert.ok(result.decisionJobs.every((x) => !/软件工程师/.test(x.title)));
  assert.ok(result.eliteJobs.every((x) => x.universityElite));
  assert.ok(result.specialtyJobs.every((x) => x.universitySpecialty));
});
