import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractUniversityRecruitLinks, parseUniversityJobPage, searchUniversityJobs } from '../scripts/job-discovery/university.mjs';
import { dedupePreferOfficial, dedupeById } from '../scripts/job-discovery/dedupe.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config/university-sources.json', import.meta.url), 'utf8'));

test('university scope includes 985/211/double-first-class and language-trade schools', () => {
  assert.deepEqual(config.selectionPolicy.includeGroups, ['985','211','双一流','外语外贸特色高校']);
  const names = new Set(config.schools.map((s) => s.school));
  for (const school of ['南开大学','湖南大学','广东外语外贸大学','上海外国语大学','北京语言大学','对外经济贸易大学','北京外国语大学']) {
    assert.ok(names.has(school), `missing school seed: ${school}`);
  }
  assert.ok(config.schools.filter((s) => s.enabled).length >= 6);
});

test('university list parser keeps recruitment links and drops generic notices', () => {
  const html = `
    <a href="/detail/1">某公司2027届校园招聘</a>
    <a href="/notice/2">就业手续办理通知</a>
    <a href="https://evil.example.com/detail/3">另一公司2027届校园招聘</a>`;
  const links = extractUniversityRecruitLinks(html, 'https://career.example.edu.cn/list', { school: '示例大学' });
  assert.deepEqual(links.map((x) => x.url), ['https://career.example.edu.cn/detail/1']);
});

test('university detail parser marks source as discovery evidence, not company-official truth', () => {
  const job = parseUniversityJobPage({
    html: `<html><h1>某科技公司2027届校园招聘</h1><p>发布时间：2026-09-01</p><p>海外市场、产品运营、英语沟通，工作地点深圳。</p></html>`,
    url: 'https://career.example.edu.cn/detail/1',
    source: { school: '示例大学', segments: ['双一流'], priority: 100, listUrls: ['https://career.example.edu.cn/list'] },
    now: new Date('2026-09-10T00:00:00Z')
  });
  assert.equal(job.graduationYear, '2027');
  assert.equal(job.sourceChannel, 'university');
  assert.equal(job.sourceType, 'secondary');
  assert.match(job.verification, /待公司官网复核/);
  assert.equal(job.universitySource.school, '示例大学');
  assert.ok(job.roleFamily.some((x) => /产品运营|海外运营/.test(x)));
});

test('university discovery works with a mock school board and respects relevance filtering', async () => {
  const listUrl = 'https://career.example.edu.cn/list';
  const detailUrl = 'https://career.example.edu.cn/detail/1';
  const pages = new Map([
    [listUrl, `<a href="${detailUrl}">某科技公司2027届海外运营校园招聘</a>`],
    [detailUrl, `<h1>某科技公司2027届海外运营校园招聘</h1><p>发布时间：2026-09-01</p><p>负责海外市场、国际业务、英语沟通和用户运营，深圳。</p>`]
  ]);
  const profile = {
    graduationYear: '2027', roleKeywords: ['海外运营','国际业务','用户运营'], keywords: ['海外','英语','运营'],
    targetCities: ['深圳'], strongExclude: [], minRelevanceScore: 1
  };
  const result = await searchUniversityJobs(profile, {
    maxActiveSchools: 2,
    schools: [{ school: '示例大学', enabled: true, priority: 100, segments: ['双一流'], listUrls: [listUrl] }]
  }, { fetcher: async (url) => pages.get(url) ?? (() => { throw new Error(`unexpected ${url}`); })() });
  assert.equal(result.stats.portals, 1);
  assert.equal(result.stats.listed, 1);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].company, '某科技公司');
});

test('cross-source dedupe preserves university evidence while preferring company official source', () => {
  const official = {
    id: 'official-1', company: '某科技公司', title: '海外运营', city: '深圳', sourceType: 'official',
    source: '公司官方招聘官网', sourceUrl: 'https://jobs.example.com/1', publishedAt: '2026-09-08'
  };
  const university = {
    id: 'uni-1', company: '某科技公司', title: '海外运营', city: '深圳', sourceType: 'secondary',
    source: '某大学就业信息网', sourceUrl: 'https://career.example.edu.cn/1', publishedAt: '2026-09-09',
    sourceEvidence: [{ label: '某大学就业信息网', url: 'https://career.example.edu.cn/1' }]
  };
  const [merged] = dedupePreferOfficial([university, official]);
  assert.equal(merged.sourceType, 'official');
  assert.equal(merged.sourceUrl, official.sourceUrl);
  assert.ok(merged.sourceEvidence.some((row) => row.url === university.sourceUrl));
  assert.ok(merged.sourceEvidence.some((row) => row.url === official.sourceUrl));
});

test('dedupeById collapses same-id rows from university and official sources', () => {
  const university = {
    id: 'shared-1', company: '示例公司', title: '海外运营', city: '深圳',
    sourceType: 'secondary', publishedAt: '2026-09-01', sourceUrl: 'https://school.example/1'
  };
  const official = {
    id: 'shared-1', company: '示例公司', title: '海外运营（校招）', city: '深圳南山',
    sourceType: 'official', publishedAt: '2026-09-08', sourceUrl: 'https://company.example/job'
  };
  const [merged] = dedupeById([university, official]);
  assert.equal(merged.sourceType, 'official');
  assert.equal(merged.sourceUrl, official.sourceUrl);
});

