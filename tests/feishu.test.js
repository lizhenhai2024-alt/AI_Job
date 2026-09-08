import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebsitePath, parseFeishuJob, searchFeishuJobs } from '../scripts/job-discovery/feishu.mjs';

const profile = {
  graduationYear: '2027',
  roleKeywords: ['海外运营','产品营销','电商运营','招聘运营','市场','运营','管培生','管理培训生'],
  keywords: ['英语','海外','市场','运营','电商','招聘','管培'],
  targetCities: ['深圳','上海'],
  strongExclude: ['实施','实习','实习生','Intern','Internship'],
  minRelevanceScore: 4
};

function response({ ok = true, status = 200, json, text = '' }) {
  return {
    ok,
    status,
    async json() { return typeof json === 'function' ? json() : json; },
    async text() { return text; }
  };
}

test('parses Feishu website path only as compatibility metadata', () => {
  const html = '<html><script id="js-websiteInfo">{"website_info":{"path":"campus-2027"}}</script></html>';
  assert.equal(parseWebsitePath(html), 'campus-2027');
  assert.equal(parseWebsitePath('<html></html>'), '');
});

test('generic Feishu job requires per-job 2027 evidence', () => {
  const row = {
    id: '1',
    title: '海外广告投放管培生',
    city_list: [{ name: '深圳' }],
    description: '负责海外市场投放与跨文化内容协同',
    requirement: '英语可作为工作语言',
    recruit_type: { name: '校园招聘' }
  };
  const noEvidence = parseFeishuJob({ company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn', graduationYear: '2027', cohortMode: 'verified-2027-portal' }, row);
  assert.equal(noEvidence.graduationYear, '');
  assert.match(noEvidence.verification, /届别待核/);

  const jdVerified = parseFeishuJob(
    { company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn', graduationYear: '2027' },
    { ...row, requirement: '面向2027届毕业生，英语可作为工作语言' }
  );
  assert.equal(jdVerified.graduationYear, '2027');
  assert.match(jdVerified.verification, /岗位文本明确2027届/);
});

test('generic Feishu discovery uses zero-auth list API, paginates and removes internship recruit type', async () => {
  const source = {
    company: '影石Insta360',
    baseUrl: 'https://arashivision.jobs.feishu.cn',
    graduationYear: '2027',
    detailTemplate: 'https://arashivision.jobs.feishu.cn/campus/m/position/{id}/detail',
    pageSize: 2,
    maxPages: 3,
    maxJobs: 20
  };
  let apiCalls = 0;
  const fetcher = async (url, options = {}) => {
    assert.equal(url, 'https://arashivision.jobs.feishu.cn/api/v1/search/job/posts');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['website-path'], undefined);
    assert.equal(options.headers['portal-channel'], undefined);
    assert.match(options.headers['user-agent'], /Macintosh/);
    assert.equal(options.headers.referer, 'https://arashivision.jobs.feishu.cn/');
    apiCalls++;
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ['limit','offset']);
    if (body.offset === 0) {
      return response({ json: { code: 0, data: { count: 2, job_post_list: [
        {
          id: 'fulltime-1', title: '海外广告投放管培生-2027校招', city_list: [{ name: '深圳' }],
          description: '负责海外市场投放、数据复盘和跨部门协同', requirement: '2027届毕业生，英文沟通流利',
          job_function: { name: '市场营销' }, recruit_type: { name: '校园招聘' }, publish_time: 1788307200
        },
        {
          id: 'intern-1', title: '市场运营-2027校园实习', city_list: [{ name: '深圳' }],
          description: '支持市场运营', requirement: '2027届，英文良好',
          job_function: { name: '市场营销' }, recruit_type: { name: '实习' }, publish_time: 1788307200
        }
      ] } } });
    }
    return response({ json: { code: 0, data: { count: 2, job_post_list: [] } } });
  };

  const result = await searchFeishuJobs(profile, [source], { fetcher, now: new Date('2026-09-08T00:00:00Z') });
  assert.ok(apiCalls >= 1);
  assert.equal(result.stats.portals, 1);
  assert.equal(result.stats.scannedPortals, 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.listed, 2);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '海外广告投放管培生-2027校招');
  assert.equal(result.jobs[0].sourceType, 'official');
  assert.equal(result.jobs[0].languages.includes('英语'), true);
  assert.equal(result.jobs[0].sourceUrl, 'https://arashivision.jobs.feishu.cn/campus/m/position/fulltime-1/detail');
});

test('generic Feishu filters social recruit rows even when text contains 2027', async () => {
  const source = { company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn', graduationYear: '2027', pageSize: 100, maxPages: 1, maxJobs: 100 };
  const fetcher = async () => response({ json: { code: 0, data: { count: 2, job_post_list: [
    { id:'campus', title:'海外运营-2027校招', city_list:[{name:'上海'}], description:'负责海外运营', requirement:'2027届，英语流利', recruit_type:{name:'校园招聘'} },
    { id:'social', title:'海外运营经理', city_list:[{name:'上海'}], description:'负责2027年度海外运营计划', requirement:'3年以上经验', recruit_type:{name:'社会招聘'} }
  ] } } });
  const result = await searchFeishuJobs(profile, [source], { fetcher });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].id.includes('campus'), true);
});

test('empty Feishu official source is surfaced with diagnostic error', async () => {
  const source = { company: '空门户', baseUrl: 'https://empty.jobs.feishu.cn', graduationYear: '2027' };
  const fetcher = async () => response({ json: { code: 0, data: { count: 0, job_post_list: [] } } });
  const result = await searchFeishuJobs(profile, [source], { fetcher });
  assert.equal(result.stats.errors, 1);
  assert.equal(result.stats.scannedPortals, 0);
  assert.equal(result.stats.perPortal['空门户'].snapshotComplete, false);
  assert.match(result.stats.perPortal['空门户'].error, /zero jobs/);
});

test('Feishu API error code is preserved in source-health diagnostics', async () => {
  const source = { company: '错误门户', baseUrl: 'https://bad.jobs.feishu.cn', graduationYear: '2027' };
  const fetcher = async () => response({ json: { code: 10001, message: 'invalid request', data: null } });
  const result = await searchFeishuJobs(profile, [source], { fetcher });
  assert.equal(result.stats.errors, 1);
  assert.match(result.stats.perPortal['错误门户'].error, /10001/);
  assert.match(result.stats.perPortal['错误门户'].error, /invalid request/);
});
