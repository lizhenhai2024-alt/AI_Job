import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobPage, shouldKeep, dedupeJobs, companiesFromJobs, relevanceScore } from '../scripts/job-discovery/core.mjs';
import { parseSitemap, parseRobotsSitemaps, discoverJobUrls } from '../scripts/job-discovery/nowcoder.mjs';

const profile = {
  graduationYear: '2027', roleKeywords: ['海外运营','产品运营','产品营销','电商运营','用户运营','业务运营','市场'],
  keywords: ['英语','海外','运营','数据分析'], targetCities: ['深圳','上海','北京'], strongExclude: ['软件工程师'], minRelevanceScore: 4
};

function jobHtml(overrides = {}) {
  const posting = {
    '@context': 'https://schema.org', '@type': 'JobPosting', title: '电商运营（英语）',
    hiringOrganization: { '@type': 'Organization', name: '示例公司' },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: '深圳' } },
    datePosted: '2026-08-31', validThrough: '2027-08-31',
    description: '面向2027届毕业生，负责海外电商运营、销售数据分析，要求英语六级、Excel能力。',
    ...overrides
  };
  return `<html><head><title>电商运营（英语）_示例公司校招_牛客网</title><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body>2027届校园招聘</body></html>`;
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

test('falls back to title/company and Chinese投递时间 when JSON-LD is absent', () => {
  const html = '<html><head><title>海外版本运营_乐元素校招_牛客网</title></head><body><h1>海外版本运营</h1>面向2027届，英语作为工作语言。岗位职责 海外版本内容运营。投递时间：2026年8月1日-2027年6月30日 工作地点 上海</body></html>';
  const job = parseJobPage({ html, url: 'https://www.nowcoder.com/jobs/detail/100002', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(job.company, '乐元素');
  assert.equal(job.deadline, '2027-06-30');
  assert.equal(job.city, '上海');
  assert.ok(job.roleFamily.includes('海外运营'));
});

test('filters cohort and relevance while excluding technical roles', () => {
  const good = parseJobPage({ html: jobHtml(), url: 'https://www.nowcoder.com/jobs/detail/100003' });
  assert.ok(relevanceScore(good, profile) >= 4);
  assert.equal(shouldKeep(good, profile, new Date('2026-09-08T00:00:00Z')), true);
  const bad = { ...good, title: '软件工程师', roleFamily: ['其他'] };
  assert.equal(shouldKeep(bad, profile, new Date('2026-09-08T00:00:00Z')), false);
});

test('dedupe keeps the newer equivalent job', () => {
  const base = { id: 'a', company: 'A公司', title: '产品运营', city: '深圳', publishedAt: '2026-08-01' };
  const newer = { ...base, id: 'b', publishedAt: '2026-09-01' };
  const jobs = dedupeJobs([base, newer]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'b');
});

test('aggregates companies from discovered jobs', () => {
  const companies = companiesFromJobs([
    { company: 'A公司', city: '深圳', roleFamily: ['海外运营'], publishedAt: '2026-09-01', source: '牛客', verification: '待核' },
    { company: 'A公司', city: '上海', roleFamily: ['产品营销'], publishedAt: '2026-09-02', source: '牛客', verification: '待核' }
  ]);
  assert.equal(companies[0].jobCount, 2);
  assert.deepEqual(new Set(companies[0].cities), new Set(['深圳','上海']));
});

test('discovers job detail URLs by robots sitemap recursion', async () => {
  const fixtures = new Map([
    ['https://www.nowcoder.com/robots.txt', 'User-agent: *\nSitemap: https://www.nowcoder.com/root-sitemap.xml'],
    ['https://www.nowcoder.com/root-sitemap.xml', '<sitemapindex><sitemap><loc>https://www.nowcoder.com/jobs-sitemap.xml</loc></sitemap></sitemapindex>'],
    ['https://www.nowcoder.com/jobs-sitemap.xml', '<urlset><url><loc>https://www.nowcoder.com/jobs/detail/123</loc><lastmod>2026-09-08</lastmod></url></urlset>']
  ]);
  const fetcher = async (url) => {
    if (!fixtures.has(url)) throw new Error(`unexpected ${url}`);
    return fixtures.get(url);
  };
  assert.deepEqual(parseRobotsSitemaps(fixtures.get('https://www.nowcoder.com/robots.txt')), ['https://www.nowcoder.com/root-sitemap.xml']);
  assert.equal(parseSitemap(fixtures.get('https://www.nowcoder.com/jobs-sitemap.xml'))[0].loc, 'https://www.nowcoder.com/jobs/detail/123');
  const urls = await discoverJobUrls({ fetcher, maxSitemaps: 5, maxCandidates: 10 });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].url, 'https://www.nowcoder.com/jobs/detail/123');
});
