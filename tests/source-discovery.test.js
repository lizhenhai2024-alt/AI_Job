import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiscoveryQueue,
  canonicalCompanyKey,
  cohortEvidence,
  decodeSearchHref,
  extractSearchCandidates,
  isLikelyOfficialCareerUrl,
  mergeAuditEntry,
  sourceProviderFromUrl
} from '../scripts/job-discovery/source-candidates.mjs';
import { buildSourceHealth, evaluateSourceHealth } from '../scripts/job-discovery/source-health.mjs';

test('source provider detection recognizes supported ATS hosts only', () => {
  assert.equal(sourceProviderFromUrl('https://app.mokahr.com/campus-recruitment/demo/123'), 'moka');
  assert.equal(sourceProviderFromUrl('https://demo.zhiye.com/campus/jobs'), 'beisen');
  assert.equal(sourceProviderFromUrl('https://demo.jobs.feishu.cn/campus'), 'feishu');
  assert.equal(sourceProviderFromUrl('https://wecruit.hotjob.cn/SU0123456789abcdef01234567/pb/school.html'), 'hotjob');
  assert.equal(sourceProviderFromUrl('https://www.nowcoder.com/jobs/detail/1'), '');
});

test('official career URL heuristic rejects aggregators but keeps ATS, career paths, and career hostnames', () => {
  assert.equal(isLikelyOfficialCareerUrl('https://www.nowcoder.com/jobs/detail/1'), false);
  assert.equal(isLikelyOfficialCareerUrl('https://example.com/careers/campus'), true);
  assert.equal(isLikelyOfficialCareerUrl('https://brand.jobs.feishu.cn/campus'), true);
  assert.equal(isLikelyOfficialCareerUrl('https://careers.tencent.com/'), true);
  assert.equal(isLikelyOfficialCareerUrl('https://jobs.example.com/'), true);
});

test('search result extraction unwraps DuckDuckGo redirect and keeps official candidates', () => {
  const target = encodeURIComponent('https://brand.jobs.feishu.cn/campus');
  const html = `<a href="//duckduckgo.com/l/?uddg=${target}">Brand 2027 校园招聘</a><a href="https://www.nowcoder.com/jobs/detail/1">二手职位</a>`;
  const rows = extractSearchCandidates(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, 'feishu');
  assert.ok(rows[0].url.startsWith('https://brand.jobs.feishu.cn/campus'));
});

test('Bing redirect decoding recovers career URLs encoded with the a1 target format', () => {
  const target = 'https://careers.tencent.com/';
  const encoded = Buffer.from(target).toString('base64url');
  const href = `https://www.bing.com/ck/a?u=a1${encoded}&ntb=1`;
  assert.equal(decodeSearchHref(href), target);
  const rows = extractSearchCandidates(`<a href="${href}">腾讯招聘官网</a>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, target);
});

test('discovery queue covers all active unmanaged companies and prioritizes main/user requests', () => {
  const records = [
    { name: '主投A', status: '主投', sourceManaged: false, userRequested: false, evidence: { count: 2 } },
    { name: '观察B', status: '观察', sourceManaged: false, userRequested: true, evidence: { count: 0 } },
    { name: '已接入C', status: '主投', sourceManaged: true },
    { name: '风险D', status: '风险', sourceManaged: false }
  ];
  const queue = buildDiscoveryQueue(records, { companies: {} }, { limit: 10, now: new Date('2026-09-09T00:00:00Z') });
  assert.deepEqual(queue.map((item) => item.name), ['主投A', '观察B']);
});

test('discovery queue respects retry backoff but source-discovery code changes can force an immediate retry', () => {
  const key = canonicalCompanyKey('示例公司');
  const records = [{ name: '示例公司', status: '主投', sourceManaged: false }];
  const future = '2026-09-12T00:00:00.000Z';
  const audit = { companies: { [key]: { nextCheckAfter: future, attempts: 2 } } };
  const queue = buildDiscoveryQueue(records, audit, { limit: 10, now: new Date('2026-09-09T00:00:00Z') });
  assert.equal(queue.length, 0);
  const forced = buildDiscoveryQueue(records, audit, { limit: 10, now: new Date('2026-09-09T00:00:00Z'), forceRetry: true });
  assert.equal(forced.length, 1);
  const merged = mergeAuditEntry({ attempts: 2 }, { state: 'not_found', name: '示例公司' }, new Date('2026-09-09T00:00:00Z'));
  assert.equal(merged.attempts, 3);
  assert.ok(merged.nextCheckAfter > '2026-09-09T00:00:00.000Z');
});

test('2027 evidence requires cohort and campus recruitment context', () => {
  assert.equal(cohortEvidence('2027届校园招聘正式批'), true);
  assert.equal(cohortEvidence('2027年度社会责任报告'), false);
});

test('Feishu health flags broad or non-formal 2027 sources instead of treating API success as healthy', () => {
  const noFormal = evaluateSourceHealth('feishu', { company: '蔚来', websitePath: 'index' }, {
    listed: 1829, cohortMatched: 49, internRejected: 48, socialRejected: 1, keptJobs: 0, errors: 0
  });
  assert.equal(noFormal.status, 'no_formal_2027');
  assert.equal(noFormal.healthy, false);

  const broad = evaluateSourceHealth('feishu', { company: '示例', websitePath: 'index' }, {
    listed: 1000, cohortMatched: 40, internRejected: 5, socialRejected: 0, keptJobs: 10, errors: 0
  });
  assert.equal(broad.status, 'broad_scope');
  assert.equal(broad.healthy, false);
});

test('source health is computed for every configured managed source', () => {
  const health = buildSourceHealth({
    feishu: { perPortal: { A: { listed: 20, cohortMatched: 10, internRejected: 1, socialRejected: 0, keptJobs: 5, errors: 0 } } },
    beisen: { perPortal: { B: { scannedRows: 100, keptJobs: 8, errors: 0 } } }
  }, {
    feishu: [{ company: 'A', websitePath: 'campus' }],
    beisen: [{ company: 'B', baseUrl: 'https://b.zhiye.com' }]
  });
  assert.equal(health.total, 2);
  assert.equal(health.healthy, 2);
  assert.equal(health.attention, 0);
});
