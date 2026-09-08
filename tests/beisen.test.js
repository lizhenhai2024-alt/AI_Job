import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBeisenRow, searchBeisenJobs } from '../scripts/job-discovery/beisen.mjs';

const source = { company: '示例企业', baseUrl: 'https://example.zhiye.com', graduationYear: '2027' };
const profile = {
  graduationYear: '2027',
  roleKeywords: ['运营','海外运营','产品运营','产品营销','市场','用户运营','业务运营'],
  keywords: ['英语','海外','数据分析'],
  targetCities: ['深圳','上海','北京'],
  strongExclude: ['软件工程师'],
  minRelevanceScore: 4
};

test('normalizes a Beisen campus row with official provenance', () => {
  const job = parseBeisenRow(source, {
    JobAdId: 'job-1',
    JobAdName: '海外市场运营（2027届校招）',
    Category: '校园招聘',
    LocNames: ['深圳市'],
    Duty: '负责海外市场和用户运营、数据分析',
    Require: '英语可作为工作语言',
    PostDate: '2026-09-01'
  }, new Date('2026-09-08T00:00:00Z'));
  assert.equal(job.company, '示例企业');
  assert.equal(job.city, '深圳');
  assert.equal(job.sourceType, 'official');
  assert.equal(job.verification, '官方招聘官网');
  assert.ok(job.sourceUrl.includes('/campus/detail?jobAdId=job-1'));
  assert.ok(job.skills.includes('英语'));
});

test('Beisen discovery pages anonymously and filters pure sales', async () => {
  const payload = {
    Code: 200,
    Count: 2,
    Data: [
      { JobAdId: '1', JobAdName: '产品运营（2027届校招）', Category: '校园招聘', LocNames: ['上海市'], Duty: '用户运营和数据分析', Require: '英语六级' },
      { JobAdId: '2', JobAdName: '国内销售经理（2027届校招）', Category: '校园招聘', LocNames: ['北京'], Duty: '负责客户销售', Require: '抗压' }
    ]
  };
  const fetcher = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await searchBeisenJobs(profile, [source], { fetcher, pageSize: 50, maxPages: 2, now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(result.stats.scannedPortals, 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '产品运营（2027届校招）');
});
