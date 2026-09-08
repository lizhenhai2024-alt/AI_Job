import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEcoflowJob, searchEcoflowJobs } from '../scripts/job-discovery/ecoflow.mjs';

const source = {
  company: '正浩创新EcoFlow',
  url: 'https://jobs.ecoflow.com/602892',
  apiBase: 'https://jobs.ecoflow.com',
  websitePath: '602892',
  portalType: 6,
  graduationYear: '2027',
  pageSize: 10,
  maxPages: 60,
  maxJobs: 300
};
const profile = {
  graduationYear: '2027',
  roleKeywords: ['运营','海外运营','产品运营','产品营销','市场','用户运营','电商运营','GTM'],
  keywords: ['英语','海外','数据分析','营销','用户'],
  targetCities: ['深圳','上海','北京'],
  strongExclude: ['软件工程师','嵌入式工程师'],
  minRelevanceScore: 4
};

function row(id, title, extra = {}) {
  return {
    id,
    title,
    description: '负责海外市场、用户运营、内容与数据分析。',
    requirement: '英语可作为工作语言，具备跨文化沟通能力。',
    city_list: [{ name: '深圳' }],
    publish_time: 1788796800000,
    job_category: { name: '营销服' },
    recruit_type: { name: '校园招聘' },
    ...extra
  };
}

test('normalizes EcoFlow official 2027 campus role', () => {
  const job = parseEcoflowJob(source, row('123456789', 'GTM'), new Date('2026-09-08T00:00:00Z'));
  assert.equal(job.company, '正浩创新EcoFlow');
  assert.equal(job.city, '深圳');
  assert.equal(job.graduationYear, '2027');
  assert.equal(job.sourceType, 'official');
  assert.equal(job.verification, '官方招聘官网/API');
  assert.ok(job.roleFamily.includes('GTM'));
  assert.ok(job.preferenceTags.includes('国际业务'));
  assert.ok(job.sourceUrl.includes('/602892/position/123456789/detail'));
});

test('EcoFlow functional family is preferred over broad industry category', () => {
  const job = parseEcoflowJob(source, row('func-1', '会员运营', {
    job_function: { name: '营销服类' },
    job_category: { name: '能源 / 矿产 / 环保 / 农林牧渔' }
  }));
  assert.ok(job.description.includes('职类：营销服类'));
  assert.ok(!job.description.includes('职类：能源 / 矿产 / 环保 / 农林牧渔'));
});

test('EcoFlow technical title stays outside target role families', () => {
  const job = parseEcoflowJob(source, row('999', '嵌入式软件工程师', { description: '负责嵌入式软件开发。' }));
  assert.deepEqual(job.roleFamily, ['其他']);
});

test('EcoFlow public Feishu API uses campaign website-path and paginates', async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/api/v1/csrf/token')) {
      return new Response(JSON.stringify({ data: { token: 'public-csrf' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'sessionid=public; Path=/; HttpOnly' }
      });
    }
    if (url.includes('/api/v1/search/job/posts')) {
      const body = JSON.parse(init.body);
      const posts = body.offset === 0
        ? [row('1', 'GTM'), row('2', '嵌入式软件工程师', { description: '负责软件开发', requirement: '计算机专业' })]
        : [row('3', '渠道销售', { description: '负责销售客户拓展', requirement: '抗压' })];
      return new Response(JSON.stringify({ data: { job_post_list: posts } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await searchEcoflowJobs(profile, source, { fetcher, pageSize: 2, maxPages: 5, maxJobs: 20, now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(result.stats.pages, 2);
  assert.equal(result.stats.listed, 3);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.snapshotComplete, true);
  assert.equal(result.stats.emptyResult, false);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'GTM');
  const searchCall = calls.find((c) => c.url.includes('/api/v1/search/job/posts'));
  assert.equal(searchCall.init.headers['website-path'], '602892');
  assert.equal(searchCall.init.headers['x-csrf-token'], 'public-csrf');
  assert.ok(searchCall.init.headers.cookie.includes('sessionid=public'));
});

test('EcoFlow zero-job response is a source-health error, not a complete snapshot', async () => {
  const fetcher = async (url) => {
    if (url.endsWith('/api/v1/csrf/token')) {
      return new Response(JSON.stringify({ data: { token: 'public-csrf' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'sessionid=public; Path=/' }
      });
    }
    if (url.includes('/api/v1/search/job/posts')) {
      return new Response(JSON.stringify({ data: { job_post_list: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await searchEcoflowJobs(profile, source, { fetcher, now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(result.stats.pages, 1);
  assert.equal(result.stats.listed, 0);
  assert.equal(result.stats.keptJobs, 0);
  assert.equal(result.stats.errors, 1);
  assert.equal(result.stats.emptyResult, true);
  assert.equal(result.stats.snapshotComplete, false);
});
