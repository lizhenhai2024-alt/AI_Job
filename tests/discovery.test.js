import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobPage, shouldKeep, dedupeJobs, companiesFromJobs, discoverUrlsFromRobots } from '../scripts/job-discovery/core.mjs';
import { parseMokaCard } from '../scripts/job-discovery/moka.mjs';

const profile = {
  graduationYear: '2027',
  roleKeywords: ['GTM','产品运营','产品营销','海外运营','电商运营','用户运营','内容运营','业务运营','项目管理','HR','市场'],
  keywords: ['英语','CET-6','海外','国际','跨文化','运营','市场','电商','项目','数据分析'],
  targetCities: ['深圳','上海','广州','武汉','长沙','北京'],
  strongExclude: ['纯销售','销售代表','销售经理','渠道销售','软件工程师','算法工程师','研发工程师'],
  minRelevanceScore: 4
};

function jobHtml({ title='海外电商运营（深圳）-2027校招', company='示例公司', desc='2027届校园招聘。英语可作为工作语言，负责海外电商运营、市场分析与数据分析。', posted='2026-09-01', valid='2026-12-31' } = {}) {
  return `<html><head><title>${title}_${company}校招_牛客网</title><script type="application/ld+json">${JSON.stringify({ '@type':'JobPosting', title, hiringOrganization:{name:company}, description:desc, jobLocation:{address:{addressLocality:'深圳'}}, datePosted:posted, validThrough:valid })}</script></head><body><h1>${title}</h1><div>岗位职责 ${desc}</div></body></html>`;
}

test('normalizes JSON-LD JobPosting into AI Job schema', () => {
  const job = parseJobPage({ html: jobHtml(), url: 'https://www.nowcoder.com/jobs/detail/100001', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(job.company, '示例公司');
  assert.equal(job.city, '深圳');
  assert.equal(job.graduationYear, '2027');
  assert.ok(job.roleFamily.includes('电商运营'));
  assert.ok(job.skills.includes('英语'));
  assert.equal(job.sourceType, 'secondary');
});

test('normalizes an official Moka card and keeps provenance', () => {
  const job = parseMokaCard({
    company: '韶音科技', title: '海外产品营销-深圳',
    text: '负责全球市场推广、用户洞察与数据分析，英语可作为工作语言。',
    url: 'https://app.mokahr.com/campus-recruitment/aftershokzhr/36940#/job/demo'
  });
  assert.equal(job.company, '韶音科技');
  assert.equal(job.city, '深圳');
  assert.equal(job.sourceType, 'official');
  assert.match(job.verification, /^官方招聘官网/);
  assert.match(job.verification, /2027校招源/);
  assert.ok(job.roleFamily.includes('产品营销'));
  assert.ok(job.skills.includes('英语'));
});

test('official Moka technical role is still rejected by profile filter', () => {
  const job = parseMokaCard({ company: '示例公司', title: '软件工程师-北京', text: '2027届校园招聘', url: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/2' });
  assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), false);
});

test('explicit city in job title overrides company-location noise', () => {
  const html = jobHtml({
    title: '内容运营（成都）-2027校招',
    desc: '2027届校园招聘。负责内容运营与海外社媒，页面模板其他位置包含上海、深圳。'
  }).replace('</body>', '<footer>热门城市：上海 深圳 广州</footer></body>');
  const job = parseJobPage({ html, url: 'https://www.nowcoder.com/jobs/detail/100002', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(job.city, '成都');
});

test('falls back to title/company and Chinese投递时间 when JSON-LD is absent', () => {
  const html = `<html><head><title>项目运营_示例企业校招_牛客网</title></head><body><h1>项目运营</h1><p>2027届校园招聘</p><p>投递时间：2026年9月1日-2026年11月30日</p><p>岗位职责：负责项目推进和跨部门沟通，英语六级优先。</p></body></html>`;
  const job = parseJobPage({ html, url: 'https://www.nowcoder.com/jobs/detail/100003', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(job.company, '示例企业');
  assert.equal(job.title, '项目运营');
  assert.equal(job.deadline, '2026-11-30');
});

test('filters cohort and relevance while excluding technical roles', () => {
  const good = parseJobPage({ html: jobHtml(), url: 'https://www.nowcoder.com/jobs/detail/1', now: new Date('2026-09-08T00:00:00Z') });
  const old = parseJobPage({ html: jobHtml({ title:'海外电商运营', desc:'2026届校园招聘。负责海外电商运营。' }), url: 'https://www.nowcoder.com/jobs/detail/2', now: new Date('2026-09-08T00:00:00Z') });
  const tech = parseJobPage({ html: jobHtml({ title:'软件工程师-2027校招', desc:'2027届校园招聘，负责软件开发。' }), url: 'https://www.nowcoder.com/jobs/detail/3', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(shouldKeep(good, profile, new Date('2026-09-08T00:00:00Z')), true);
  assert.equal(shouldKeep(old, profile, new Date('2026-09-08T00:00:00Z')), false);
  assert.equal(shouldKeep(tech, profile, new Date('2026-09-08T00:00:00Z')), false);
});

test('page template words do not pollute role classification', () => {
  const html = jobHtml({ title:'行政专员-2027校招', desc:'2027届校园招聘。负责行政支持。' }).replace('</body>', '<footer>产品运营 海外运营 电商运营 市场</footer></body>');
  const job = parseJobPage({ html, url:'https://www.nowcoder.com/jobs/detail/4', now:new Date('2026-09-08T00:00:00Z') });
  assert.deepEqual(job.roleFamily, ['其他']);
});

test('unrelated finance job is rejected even when site chrome contains target keywords', () => {
  const html = jobHtml({ title:'财务分析-2027校招', desc:'2027届校园招聘。负责财务分析和报表。' }).replace('</body>', '<footer>英语 海外 电商 运营 市场 数据分析</footer></body>');
  const job = parseJobPage({ html, url:'https://www.nowcoder.com/jobs/detail/5', now:new Date('2026-09-08T00:00:00Z') });
  assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), false);
});

test('adjacent operations and brand titles are classified into usable role families', () => {
  const brand = parseJobPage({ html: jobHtml({ title:'品牌市场专员-2027校招', desc:'2027届校园招聘。负责品牌市场和海外推广。' }), url:'https://www.nowcoder.com/jobs/detail/6', now:new Date('2026-09-08T00:00:00Z') });
  const service = parseJobPage({ html: jobHtml({ title:'服务运营-2027校招', desc:'2027届校园招聘。负责服务运营与跨部门沟通。' }), url:'https://www.nowcoder.com/jobs/detail/7', now:new Date('2026-09-08T00:00:00Z') });
  assert.ok(brand.roleFamily.includes('产品营销') || brand.roleFamily.includes('市场'));
  assert.ok(service.roleFamily.includes('业务运营'));
  assert.equal(shouldKeep(brand, profile, new Date('2026-09-08T00:00:00Z')), true);
  assert.equal(shouldKeep(service, profile, new Date('2026-09-08T00:00:00Z')), true);
});

test('ecommerce developer role is rejected despite ecommerce title signal', () => {
  const job = parseJobPage({ html: jobHtml({ title:'电商平台开发工程师-2027校招', desc:'2027届校园招聘。负责电商系统开发。' }), url:'https://www.nowcoder.com/jobs/detail/8', now:new Date('2026-09-08T00:00:00Z') });
  assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), false);
});

test('dedupe keeps the newer equivalent job', () => {
  const a = { id:'a', company:'A', title:'海外运营', city:'深圳', publishedAt:'2026-09-01' };
  const b = { id:'b', company:'A', title:'海外运营', city:'深圳', publishedAt:'2026-09-03' };
  assert.deepEqual(dedupeJobs([a,b]).map((x) => x.id), ['b']);
});

test('aggregates companies from discovered jobs', () => {
  const rows = companiesFromJobs([
    { company:'A', city:'深圳', roleFamily:['海外运营'], publishedAt:'2026-09-01', source:'x', verification:'y' },
    { company:'A', city:'上海', roleFamily:['产品运营'], publishedAt:'2026-09-03', source:'x', verification:'y' }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].jobCount, 2);
  assert.ok(rows[0].cities.includes('深圳'));
  assert.ok(rows[0].cities.includes('上海'));
});

test('discovers job detail URLs by robots sitemap recursion', async () => {
  const pages = new Map([
    ['https://example.com/robots.txt', 'Sitemap: https://example.com/sitemap.xml'],
    ['https://example.com/sitemap.xml', '<sitemapindex><sitemap><loc>https://example.com/jobs.xml</loc></sitemap></sitemapindex>'],
    ['https://example.com/jobs.xml', '<urlset><url><loc>https://example.com/jobs/detail/1</loc><lastmod>2026-09-08</lastmod></url></urlset>']
  ]);
  const fetcher = async (url) => new Response(pages.get(url) || '', { status: pages.has(url) ? 200 : 404 });
  const rows = await discoverUrlsFromRobots('https://example.com', { fetcher, maxSitemaps: 5, maxUrls: 10 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://example.com/jobs/detail/1');
});
