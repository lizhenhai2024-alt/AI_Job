import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnkerJob, searchAnkerJobs } from '../scripts/job-discovery/anker.mjs';

const source = {
  company: '安克创新',
  url: 'https://career.anker-in.com/universities/recruitment/',
  apiBase: 'https://rainbowbridge.anker.com',
  websiteId: '7268177039772633400',
  graduationYear: '2027',
  pageSize: 10,
  maxPages: 30,
  maxJobs: 300
};
const profile = {
  graduationYear: '2027',
  roleKeywords: ['海外运营','产品运营','产品营销','电商运营','用户运营','业务运营','市场','GTM'],
  keywords: ['英语','海外','运营','数据分析'],
  targetCities: ['深圳','上海','北京'],
  strongExclude: ['软件工程师'],
  minRelevanceScore: 4
};

const fullJob = {
  id: 'job-1',
  title: '海外产品营销专员',
  subject: { name: { zh_cn: '2027届全球校园招聘' } },
  job_function: { name: { zh_cn: 'Marketing & Sales' } },
  address: { city: { name: { zh_cn: '深圳' } } },
  description: '负责全球市场推广、用户洞察、海外产品营销与数据分析。',
  requirement: '英语可作为工作语言，具备跨文化沟通能力。'
};

test('normalizes Anker official campus job', () => {
  const job = parseAnkerJob(source, fullJob, new Date('2026-09-08T00:00:00Z'));
  assert.equal(job.company, '安克创新');
  assert.equal(job.city, '深圳');
  assert.equal(job.sourceType, 'official');
  assert.equal(job.verification, '官方招聘官网');
  assert.ok(job.roleFamily.includes('产品营销'));
  assert.ok(job.skills.includes('英语'));
  assert.ok(job.preferenceTags.includes('国际业务'));
});

test('discovers Anker campus row from public list and detail APIs', async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.includes('/job_posts/search')) {
      return new Response(JSON.stringify({ code: 0, data: { items: [{ id: 'job-1', title: '海外产品营销专员', subject: { name: { zh_cn: '2027届全球校园招聘' } } }], has_more: false } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/job_posts/job-1')) {
      return new Response(JSON.stringify({ code: 0, data: { job_post: fullJob } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await searchAnkerJobs(profile, source, { fetcher, maxJobs: 10, now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(result.stats.pages, 1);
  assert.equal(result.stats.listed, 1);
  assert.equal(result.stats.detailed, 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.snapshotComplete, true);
  assert.equal(result.jobs.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].method, 'GET');
});

test('Anker discovery follows cursor pages without duplicating jobs', async () => {
  const details = new Map([
    ['job-1', fullJob],
    ['job-2', { ...fullJob, id: 'job-2', title: 'GTM Product Manager - Germany' }]
  ]);
  const fetcher = async (url) => {
    if (url.includes('/job_posts/search')) {
      const token = new URL(url).searchParams.get('page_token');
      const payload = token
        ? { code: 0, data: { items: [{ id: 'job-2', title: 'GTM Product Manager - Germany', subject: { name: { zh_cn: '2027届全球校园招聘' } } }], has_more: false } }
        : { code: 0, data: { items: [{ id: 'job-1', title: '海外产品营销专员', subject: { name: { zh_cn: '2027届全球校园招聘' } } }], has_more: true, page_token: 'next-1' } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const id = url.split('/').pop();
    return new Response(JSON.stringify({ code: 0, data: { job_post: details.get(id) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await searchAnkerJobs(profile, source, { fetcher, maxJobs: 20, maxPages: 5, now: new Date('2026-09-08T00:00:00Z') });
  assert.ok(result.stats.pages >= 1);
  assert.ok(result.stats.listed >= 1);
  assert.ok(result.stats.detailed >= 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.snapshotComplete, true);
  assert.equal(new Set(result.jobs.map((j) => j.id)).size, result.jobs.length);
});
