import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBeisenRow, parseBeisenCampusHtml, searchBeisenJobs, resolveBeisenGraduationYear, isBeisenTitleAllowed } from '../scripts/job-discovery/beisen.mjs';

const source = { company: '示例企业', baseUrl: 'https://example.zhiye.com', graduationYear: '2027' };
const profile = {
  graduationYear: '2027',
  roleKeywords: ['运营','海外运营','海外业务','贸易运营','产品运营','产品营销','市场','用户运营','业务运营','项目管理'],
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
  assert.match(job.verification, /JD明确2027届/);
  assert.ok(job.sourceUrl.includes('/campus/detail?jobAdId=job-1'));
  assert.ok(job.skills.includes('英语'));
});

test('Beisen explicit older cohorts override configured 2027 source', () => {
  const oldText = '学历背景：2025届毕业生/2026届应届生，其他专业也可投递';
  assert.equal(resolveBeisenGraduationYear(source, oldText), '');
  const job = parseBeisenRow(source, {
    JobAdId: 'old-1',
    JobAdName: '客户成功管培生-校招',
    Category: '校园招聘',
    LocNames: ['上海'],
    Duty: '负责客户成功和项目运营',
    Require: oldText
  });
  assert.equal(job.graduationYear, '');
  assert.match(job.verification, /届别冲突/);
});

test('Beisen no-year JD can inherit a verified configured campus cohort', () => {
  assert.equal(resolveBeisenGraduationYear(source, '校园招聘，负责海外市场运营，英语可作为工作语言'), '2027');
});

test('Beisen mixed internship and pure-sales titles are not eligible', () => {
  for (const title of ['招聘专员-校招/实习', '客户成功管培生-校招/实习', '销售管培生-深圳']) {
    assert.equal(isBeisenTitleAllowed(title), false, title);
  }
  assert.equal(isBeisenTitleAllowed('海外市场运营管培生'), true);
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

test('Beisen discovery rejects explicit non-2027 rows even on configured 2027 source', async () => {
  const payload = {
    Code: 200,
    Count: 2,
    Data: [
      { JobAdId: '1', JobAdName: '产品运营', Category: '校园招聘', LocNames: ['上海市'], Duty: '用户运营和数据分析', Require: '2027届应届毕业生，英语六级' },
      { JobAdId: '2', JobAdName: '客户成功管培生-校招', Category: '校园招聘', LocNames: ['上海市'], Duty: '客户成功和项目运营', Require: '2025届毕业生/2026届应届生，其他专业可投递' }
    ]
  };
  const fetcher = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await searchBeisenJobs(profile, [source], { fetcher, pageSize: 50, maxPages: 1 });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '产品运营');
  assert.equal(result.stats.perPortal['示例企业'].cohortRejected, 1);
});

test('Beisen request forwards a tenant PortalId', async () => {
  let body;
  const vivoSource = { company: 'vivo', baseUrl: 'https://hr-campus.vivo.com', portalId: 'campus-portal-id', graduationYear: '2027' };
  const fetcher = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ Code: 200, Count: 0, Data: [] }), { status: 200 });
  };
  const result = await searchBeisenJobs(profile, [vivoSource], { fetcher, maxPages: 1 });
  assert.equal(result.stats.errors, 0);
  assert.equal(body.PortalId, 'campus-portal-id');
});

test('parses server-rendered Beisen campus table as HTML fallback', async () => {
  const html = `<table><tr><td>工程支持类</td><td><a href="/campus/detail?jobAdId=J13346">政府项目管理工程师（2027届校招）</a></td><td>硕士</td><td>北京市</td></tr></table>`;
  const parsed = parseBeisenCampusHtml({ company: '中芯国际', baseUrl: 'https://smics.zhiye.com' }, html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].JobAdId, 'J13346');
  assert.equal(parsed[0].JobAdName, '政府项目管理工程师（2027届校招）');
  assert.deepEqual(parsed[0].LocNames, ['北京']);

  const fetcher = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  const result = await searchBeisenJobs(profile, [{ company: '中芯国际', baseUrl: 'https://smics.zhiye.com', graduationYear: '2027', mode: 'html' }], { fetcher, maxPages: 2 });
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.perPortal['中芯国际'].mode, 'html');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '政府项目管理工程师（2027届校招）');
});

test('ITG verified 2027 campaign HTML uses custom list/detail routes and JD enrichment', async () => {
  const itgSource = {
    company: '国贸股份',
    baseUrl: 'https://itg.zhiye.com',
    graduationYear: '2027',
    mode: 'html',
    campaignLabel: '2027届秋季全球校园招聘',
    listUrl: 'https://itg.zhiye.com/gmkgxzlb?k=&PageIndex=1&key=gmgf&job=campus',
    enrichDetails: true
  };
  const listHtml = `<div class="zwlb"><ul>
    <li><a href="/gmkgxzxq?jobId=311179882&key=gmgf&job=campus"><h2>海外业务岗(J13645)<span>国贸股份</span></h2><span>工作地址：国外-泰国</span><span>发布时间：2026-09-01</span></a></li>
    <li><a href="/gmkgxzxq?jobId=311179875&key=gmgf&job=campus"><h2>行业研究岗(J13649)<span>国贸股份</span></h2><span>工作地址：福建省-厦门市</span><span>发布时间：2026-09-01</span></a></li>
  </ul></div>`;
  const overseasDetail = `<html><body>职位详情 海外业务岗(J13645) 薪资范围：14-18 万元/年 发布时间：2026-09-01 工作地址：国外-泰国,国外-马来西亚 工作职责 收集海外市场信息，开拓国际市场客户。任职资格 本科及以上学历，英语专业通过专业四级；责任感强，沟通能力优秀。立即申请</body></html>`;
  const researchDetail = `<html><body>职位详情 行业研究岗(J13649) 薪资范围：14-16 万元/年 发布时间：2026-09-01 工作地址：福建省-厦门市 工作职责 开展大宗商品量化研究。任职资格 熟练 Python、R、MATLAB、C++ 和 SQL。立即申请</body></html>`;
  const fetcher = async (url) => {
    const value = String(url);
    if (value.includes('gmkgxzlb')) return new Response(listHtml, { status: 200, headers: { 'content-type': 'text/html' } });
    if (value.includes('311179882')) return new Response(overseasDetail, { status: 200, headers: { 'content-type': 'text/html' } });
    if (value.includes('311179875')) return new Response(researchDetail, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('', { status: 404 });
  };

  const parsed = parseBeisenCampusHtml(itgSource, listHtml);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].JobAdId, '311179882');
  assert.equal(parsed[0].JobAdName, '海外业务岗(J13645)');
  assert.match(parsed[0].DetailUrl, /gmkgxzxq\?jobId=311179882/);

  const result = await searchBeisenJobs(profile, [itgSource], { fetcher, maxPages: 2, now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.scannedPortals, 1);
  assert.equal(result.stats.perPortal['国贸股份'].mode, 'html');
  assert.equal(result.stats.perPortal['国贸股份'].detailErrors, 0);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '海外业务岗(J13645)');
  assert.equal(result.jobs[0].city, '国外');
  assert.equal(result.jobs[0].salary, '14-18 万元/年');
  assert.ok(result.jobs[0].languages.includes('英语'));
  assert.match(result.jobs[0].verification, /已核验2027届秋季全球校园招聘/);
  assert.match(result.jobs[0].sourceUrl, /gmkgxzxq\?jobId=311179882/);
});
