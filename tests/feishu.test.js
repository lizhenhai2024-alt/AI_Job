import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebsitePath, parseFeishuJob, searchFeishuJobs } from '../scripts/job-discovery/feishu.mjs';

const profile = {
  graduationYear: '2027',
  roleKeywords: ['海外运营','产品营销','电商运营','招聘运营','市场','运营'],
  keywords: ['英语','海外','市场','运营','电商','招聘'],
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

test('parses Feishu website path from public portal metadata', () => {
  const html = '<html><script id="js-websiteInfo">{"website_info":{"path":"campus-2027"}}</script></html>';
  assert.equal(parseWebsitePath(html), 'campus-2027');
  assert.equal(parseWebsitePath('<html></html>'), '');
});

test('Feishu job requires JD cohort evidence unless portal is explicitly verified', () => {
  const row = {
    id: '1',
    title: '海外广告投放管培生',
    city_list: [{ name: '深圳' }],
    description: '负责海外市场投放与跨文化内容协同',
    requirement: '英语可作为工作语言',
    recruit_type: { name: '校园招聘' }
  };
  const unverified = parseFeishuJob({ company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn', graduationYear: '2027' }, row, 'campus');
  assert.equal(unverified.graduationYear, '');

  const jdVerified = parseFeishuJob({ company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn' }, { ...row, requirement: '面向2027届毕业生，英语可作为工作语言' }, 'campus');
  assert.equal(jdVerified.graduationYear, '2027');

  const portalVerified = parseFeishuJob({ company: '测试公司', baseUrl: 'https://demo.jobs.feishu.cn', graduationYear: '2027', cohortMode: 'verified-2027-portal' }, row, 'campus');
  assert.equal(portalVerified.graduationYear, '2027');
  assert.match(portalVerified.verification, /2027届门户已核验/);
});

test('generic Feishu discovery resolves website path, paginates and removes internship recruit type', async () => {
  const source = {
    company: '影石Insta360',
    baseUrl: 'https://arashivision.jobs.feishu.cn',
    graduationYear: '2027',
    cohortMode: 'verified-2027-portal',
    pageSize: 2,
    maxPages: 3,
    maxJobs: 20
  };
  let apiCalls = 0;
  const fetcher = async (url, options = {}) => {
    if (options.method === 'GET') {
      return response({ text: '<script id="js-websiteInfo">{"website_info":{"path":"campus"}}</script>' });
    }
    assert.equal(options.headers['website-path'], 'campus');
    apiCalls++;
    const body = JSON.parse(options.body);
    if (body.limit === 1) {
      return response({ json: { code: 0, data: { count: 2, job_post_list: [{ id: 'probe' }] } } });
    }
    if (body.offset === 0) {
      return response({ json: { code: 0, data: { count: 2, job_post_list: [
        {
          id: 'fulltime-1', title: '海外广告投放管培生', city_list: [{ name: '深圳' }],
          description: '负责海外市场投放、数据复盘和跨部门协同', requirement: '英文沟通流利',
          job_function: { name: '市场营销' }, recruit_type: { name: '校园招聘' }, publish_time: 1788307200
        },
        {
          id: 'intern-1', title: '市场运营', city_list: [{ name: '深圳' }],
          description: '支持市场运营', requirement: '英文良好',
          job_function: { name: '市场营销' }, recruit_type: { name: '实习' }, publish_time: 1788307200
        }
      ] } } });
    }
    return response({ json: { code: 0, data: { count: 2, job_post_list: [] } } });
  };

  const result = await searchFeishuJobs(profile, [source], { fetcher, now: new Date('2026-09-08T00:00:00Z') });
  assert.ok(apiCalls >= 2);
  assert.equal(result.stats.portals, 1);
  assert.equal(result.stats.scannedPortals, 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.listed, 2);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '海外广告投放管培生');
  assert.equal(result.jobs[0].sourceType, 'official');
  assert.equal(result.jobs[0].languages.includes('英语'), true);
  assert.match(result.jobs[0].sourceUrl, /\/campus\/position\/fulltime-1\/detail$/);
});

test('empty Feishu official source is surfaced as unhealthy', async () => {
  const source = { company: '空门户', baseUrl: 'https://empty.jobs.feishu.cn', websitePath: 'campus', graduationYear: '2027', cohortMode: 'verified-2027-portal' };
  const fetcher = async (url, options = {}) => {
    if (options.method === 'GET') return response({ text: '' });
    return response({ json: { code: 0, data: { count: 0, job_post_list: [] } } });
  };
  const result = await searchFeishuJobs(profile, [source], { fetcher });
  assert.equal(result.stats.errors, 1);
  assert.equal(result.stats.scannedPortals, 0);
  assert.equal(result.stats.perPortal['空门户'].snapshotComplete, false);
});
