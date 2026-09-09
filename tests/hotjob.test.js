import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHotjobDetail, searchHotjobJobs } from '../scripts/job-discovery/hotjob.mjs';
import { shouldExcludeByPolicy } from '../scripts/job-discovery/policy.mjs';

const source = {
  company: '德勤中国',
  baseUrl: 'https://wecruit.hotjob.cn',
  tenant: '64365a780dcad43c5ae82bab',
  graduationYear: '2027',
  pageSize: 100,
  maxPages: 10,
  maxDetails: 20,
  listConcurrency: 2,
  detailConcurrency: 2
};

const profile = {
  graduationYear: '2027',
  roleKeywords: ['咨询','顾问','管理咨询','项目管理','运营','市场'],
  keywords: ['英语','项目','咨询','跨部门'],
  targetCities: ['上海','北京','成都'],
  strongExclude: ['实习'],
  minRelevanceScore: 4
};

test('normalizes Deloitte Campus 2027 HotJob detail with official provenance', () => {
  const row = {
    postId: 'p1', postName: 'Analyst - Business Consulting - SH', projectName: 'Campus 2027',
    postTypeName: 'Business Consulting', workPlaceStr: '上海市', publishDate: '2026-08-21 09:29:34', endDate: '2026-10-31 23:59:59'
  };
  const detail = {
    ...row,
    workContent: '职位描述：参与客户业务流程优化、项目协调、跨部门沟通与市场研究。',
    serviceCondition: '任职要求：本科及以上，专业不限；英文可作为工作语言，沟通协作能力强。'
  };
  const job = parseHotjobDetail(source, row, detail, new Date('2026-09-09T00:00:00Z'));
  assert.equal(job.company, '德勤中国');
  assert.equal(job.graduationYear, '2027');
  assert.equal(job.city, '上海');
  assert.equal(job.sourceType, 'official');
  assert.match(job.sourceUrl, /posDetail\.html\?postId=p1&postType=campus/);
  assert.match(job.verification, /Campus 2027/);
  assert.ok(job.languages.includes('英语'));
  assert.ok(job.roleFamily.includes('咨询'));
  assert.equal(shouldExcludeByPolicy(job), false);
});

test('HotJob technical consulting detail reaches central policy and is rejected', () => {
  const row = {
    postId: 'cyber', postName: 'Analyst - Cyber Security - Consulting - CD', projectName: 'Campus 2027',
    postTypeName: 'Cyber', workPlaceStr: '成都市'
  };
  const detail = {
    ...row,
    workContent: '职位描述：为客户提供网络安全咨询、实施及运维服务，涉及渗透测试、云安全和SAP应用安全实施。',
    serviceCondition: '任职要求：要求熟悉网络安全、数据库与编程，能够独立完成技术分析。'
  };
  const job = parseHotjobDetail(source, row, detail);
  assert.equal(job.graduationYear, '2027');
  assert.equal(shouldExcludeByPolicy(job), true);
});

test('HotJob discovery paginates form API, prefilters, and fetches relevant details only', async () => {
  const listRows = [
    { postId:'p1', postName:'Analyst - Business Consulting - SH', projectName:'Campus 2027', postTypeName:'Consulting', workPlaceStr:'上海市', company:'咨询', publishDate:'2026-08-21 09:00:00', endDate:'2026-10-31 23:59:59' },
    { postId:'p2', postName:'销售经理', projectName:'Campus 2027', postTypeName:'Sales', workPlaceStr:'上海市', company:'咨询' }
  ];
  let detailCalls = 0;
  const fetcher = async (url, init = {}) => {
    const body = new URLSearchParams(init.body || '');
    if (String(url).includes('/listPosition/')) {
      assert.equal(init.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
      assert.equal(body.get('recruitType'), '1');
      const currentPage = Number(body.get('currentPage'));
      const row = listRows[currentPage - 1];
      return new Response(JSON.stringify({
        state: '200',
        data: { positonNum: 2, pageForm: { totalPage: 2, pageSize: 1, currentPage, dataCount: 2, pageData: row ? [row] : [] } }
      }), { status: 200, headers: { 'content-type':'application/json' } });
    }
    if (String(url).includes('/listPositionDetail/')) {
      detailCalls++;
      const postId = body.get('postId');
      assert.equal(postId, 'p1');
      return new Response(JSON.stringify({ state:'200', data:{
        ...listRows[0],
        workContent:'职位描述：参与客户业务流程优化、项目协调和跨部门沟通。',
        serviceCondition:'任职要求：本科及以上，专业不限，英语沟通能力良好。'
      } }), { status: 200, headers: { 'content-type':'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const result = await searchHotjobJobs(profile, [source], { fetcher, now: new Date('2026-09-09T00:00:00Z'), concurrency: 2 });
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.scannedPortals, 1);
  assert.equal(result.stats.listed, 2);
  assert.equal(result.stats.detailed, 1);
  assert.equal(detailCalls, 1);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Analyst - Business Consulting - SH');
});

test('verified HotJob campaign evidence establishes 2027 cohort when individual rows omit the year', async () => {
  const campaignSource = {
    company: 'Decathlon',
    baseUrl: 'https://wecruit.hotjob.cn',
    tenant: '64631fe6bef57c0907f133c4',
    graduationYear: '2027',
    projectEvidence: '迪卡侬2027秋季招聘',
    pageSize: 100,
    maxPages: 2,
    maxDetails: 20,
    listConcurrency: 2,
    detailConcurrency: 2
  };
  const row = {
    postId:'d1', postName:'线上运营主管', projectName:'校园招聘', postTypeName:'电商运营',
    workPlaceStr:'上海市', company:'迪卡侬', publishDate:'2026-09-01 09:00:00', endDate:'2026-11-30 23:59:59'
  };
  let detailCalls = 0;
  const fetcher = async (url, init = {}) => {
    const body = new URLSearchParams(init.body || '');
    if (String(url).includes('/listPosition/')) {
      return new Response(JSON.stringify({
        state:'200', data:{ positonNum:1, pageForm:{ totalPage:1, dataCount:1, pageData:[row] } }
      }), { status:200, headers:{ 'content-type':'application/json' } });
    }
    if (String(url).includes('/listPositionDetail/')) {
      detailCalls++;
      assert.equal(body.get('postId'), 'd1');
      return new Response(JSON.stringify({ state:'200', data:{
        ...row,
        workContent:'负责线上品类运营策略、电商活动、商品内容与库存预测，持续优化用户体验。',
        serviceCondition:'本科及以上，沟通协作能力强，有电商或内容运营经验优先。'
      } }), { status:200, headers:{ 'content-type':'application/json' } });
    }
    return new Response('{}', { status:404 });
  };

  const result = await searchHotjobJobs(profile, [campaignSource], { fetcher, now:new Date('2026-09-10T00:00:00Z'), concurrency:2 });
  assert.equal(result.stats.errors, 0);
  assert.equal(detailCalls, 1);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].graduationYear, '2027');
  assert.match(result.jobs[0].verification, /迪卡侬2027秋季招聘/);
});
