from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, got {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


# Central discovery gate: cohort + active + formal employment type only.
replace_once(
    'scripts/job-discovery/core.mjs',
    """export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  return true;
}""",
    """export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  const employmentEvidence = [job.title, job._recruitType, job._subject].filter(Boolean).join(' ');
  if (/实习|兼职|part[- ]?time|\\bIntern(?:ship)?\\b/i.test(employmentEvidence)) return false;
  return true;
}"""
)

# Moka: employment type is scope; pure sales is downstream fit, so keep it.
replace_once('scripts/job-discovery/moka.mjs', "const PURE_SALES_TITLE_RX = /销售管培生|销售代表|销售经理|渠道销售|区域销售|大客户销售|销售顾问|销售专员/i;\n", '')
replace_once(
    'scripts/job-discovery/moka.mjs',
    "if (/实习/i.test(value) || PURE_SALES_TITLE_RX.test(value)) return false;",
    "if (/实习|兼职|part[- ]?time|\\bIntern(?:ship)?\\b/i.test(value)) return false;"
)

# Beisen: same boundary; do not delete sales roles.
replace_once('scripts/job-discovery/beisen.mjs', "const PURE_SALES_TITLE_RX = /销售管培生|销售代表|销售经理|渠道销售|区域销售|大客户销售|销售顾问|销售专员/i;\n", '')
replace_once(
    'scripts/job-discovery/beisen.mjs',
    "return !/实习/i.test(value) && !PURE_SALES_TITLE_RX.test(value);",
    "return !/实习|兼职|part[- ]?time|\\bIntern(?:ship)?\\b/i.test(value);"
)
replace_once('scripts/job-discovery/beisen.mjs', "          if (job.riskTags?.includes('纯销售')) continue;\n", '')

# HotJob: do not prefilter pure-sales titles before detail discovery.
replace_once('scripts/job-discovery/hotjob.mjs', "const PURE_SALES_RX = /销售管培生|销售代表|销售专员|销售顾问|销售经理|海外销售|国际销售|渠道销售|区域销售|大客户销售/i;\nconst NON_PURE_SALES_RX = /销售运营|销售支持|销售分析|销售策略|销售计划|销售管理|商务运营/i;\n", '')
replace_once('scripts/job-discovery/hotjob.mjs', "  if (PURE_SALES_RX.test(title) && !NON_PURE_SALES_RX.test(title)) return false;\n", '')

# Production refresh must not call candidate-fit policy at all.
replace_once('scripts/refresh-jobs.mjs', "import { jobPolicyReasons, enrichCandidateFit } from './job-discovery/policy.mjs';\n", '')
replace_once(
    'scripts/refresh-jobs.mjs',
    """function countPolicyReasons(jobs = []) {
  const stats = {};
  for (const job of jobs) {
    for (const reason of jobPolicyReasons(job)) {
      stats[reason] = (stats[reason] || 0) + 1;
    }
  }
  return stats;
}

""",
    ''
)
replace_once('scripts/refresh-jobs.mjs', "const policyStats = countPolicyReasons(candidateJobs.filter((job) => !job.excludeFromLiveBoard));\n", '')
replace_once(
    'scripts/refresh-jobs.mjs',
    """const liveBoardCandidates = candidateJobs
  .filter((job) => !job.excludeFromLiveBoard)
  .map((job) => enrichCandidateFit(job, config))
  .map((job) => enrichProvenanceFields(job));""",
    """const liveBoardCandidates = candidateJobs
  .filter((job) => !job.excludeFromLiveBoard)
  .map((job) => enrichProvenanceFields(job));"""
)
replace_once('scripts/refresh-jobs.mjs', "  policyStats,\n", '')

# Prevent legacy candidateFit from unhealthy retained snapshots leaking back into generated liveJobs.
replace_once(
    'scripts/refresh-jobs.mjs',
    """    closed,
    excludeFromLiveBoard,
    ...clean
  } = job;
  return clean;""",
    """    closed,
    excludeFromLiveBoard,
    candidateFit,
    ...clean
  } = job;
  if (Array.isArray(clean.riskTags)) clean.riskTags = clean.riskTags.filter((tag) => !String(tag).startsWith('适配风险：'));
  return clean;"""
)

# University enrichment follows the same discovery-only contract.
replace_once('scripts/job-discovery/refresh-university-jobs.mjs', "import { enrichCandidateFit } from './policy.mjs';\n", '')
replace_once(
    'scripts/job-discovery/refresh-university-jobs.mjs',
    """const freshUniversityJobs = curated
  .filter((job) => !job.excludeFromLiveBoard)
  .map(enrichCandidateFit)
  .map((job) => {""",
    """const freshUniversityJobs = curated
  .filter((job) => !job.excludeFromLiveBoard)
  .map((job) => {"""
)
replace_once(
    'scripts/job-discovery/refresh-university-jobs.mjs',
    """  const { _searchText, _category, _subject, _sourceJobId, _recruitType, closed, excludeFromLiveBoard, ...clean } = job;
  return clean;""",
    """  const { _searchText, _category, _subject, _sourceJobId, _recruitType, closed, excludeFromLiveBoard, candidateFit, ...clean } = job;
  if (Array.isArray(clean.riskTags)) clean.riskTags = clean.riskTags.filter((tag) => !String(tag).startsWith('适配风险：'));
  return clean;"""
)

# Tests: pure sales retained; internship remains out of formal 2027 discovery pool.
replace_once(
    'tests/moka.test.js',
    """test('Moka mixed internship and pure-sales titles are blocked', () => {
  for (const title of ['招聘专员-校招/实习', '海外运营实习生', '销售管培生-成都']) {
    assert.equal(isMokaTitleAllowed(title), false, title);
  }
  assert.equal(isMokaTitleAllowed('海外GTM管培生'), true);
});""",
    """test('Moka blocks internships but keeps sales roles for downstream fit decisions', () => {
  for (const title of ['招聘专员-校招/实习', '海外运营实习生']) {
    assert.equal(isMokaTitleAllowed(title), false, title);
  }
  assert.equal(isMokaTitleAllowed('销售管培生-成都'), true);
  assert.equal(isMokaTitleAllowed('海外GTM管培生'), true);
});"""
)
replace_once(
    'tests/beisen.test.js',
    """test('Beisen mixed internship and pure-sales titles are not eligible', () => {
  for (const title of ['招聘专员-校招/实习', '客户成功管培生-校招/实习', '销售管培生-深圳']) {
    assert.equal(isBeisenTitleAllowed(title), false, title);
  }
  assert.equal(isBeisenTitleAllowed('海外市场运营管培生'), true);
});""",
    """test('Beisen blocks internships but keeps sales roles for downstream fit decisions', () => {
  for (const title of ['招聘专员-校招/实习', '客户成功管培生-校招/实习']) {
    assert.equal(isBeisenTitleAllowed(title), false, title);
  }
  assert.equal(isBeisenTitleAllowed('销售管培生-深圳'), true);
  assert.equal(isBeisenTitleAllowed('海外市场运营管培生'), true);
});"""
)
replace_once(
    'tests/beisen.test.js',
    """test('Beisen discovery pages anonymously and filters pure sales', async () => {""",
    """test('Beisen discovery pages anonymously and retains pure sales for downstream decisions', async () => {"""
)
replace_once(
    'tests/beisen.test.js',
    """  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '产品运营（2027届校招）');
});

test('Beisen discovery rejects explicit non-2027 rows""",
    """  assert.equal(result.jobs.length, 2);
  assert.deepEqual(new Set(result.jobs.map((job) => job.title)), new Set(['产品运营（2027届校招）', '国内销售经理（2027届校招）']));
});

test('Beisen discovery rejects explicit non-2027 rows"""
)

replace_once(
    'tests/hotjob.test.js',
    "test('HotJob technical consulting detail reaches central policy and is rejected', () => {",
    "test('HotJob technical consulting detail can still emit a downstream policy signal', () => {"
)
replace_once(
    'tests/hotjob.test.js',
    "test('HotJob discovery paginates form API, prefilters, and fetches relevant details only', async () => {",
    "test('HotJob discovery paginates form API and keeps sales roles for downstream decisions', async () => {"
)
replace_once(
    'tests/hotjob.test.js',
    """      const postId = body.get('postId');
      assert.equal(postId, 'p1');
      return new Response(JSON.stringify({ state:'200', data:{
        ...listRows[0],
        workContent:'职位描述：参与客户业务流程优化、项目协调和跨部门沟通。',
        serviceCondition:'任职要求：本科及以上，专业不限，英语沟通能力良好。'
      } }), { status: 200, headers: { 'content-type':'application/json' } });""",
    """      const postId = body.get('postId');
      const row = listRows.find((item) => item.postId === postId);
      assert.ok(row);
      return new Response(JSON.stringify({ state:'200', data:{
        ...row,
        workContent: postId === 'p1' ? '职位描述：参与客户业务流程优化、项目协调和跨部门沟通。' : '职位描述：负责客户销售与业务拓展。',
        serviceCondition:'任职要求：本科及以上，专业不限。'
      } }), { status: 200, headers: { 'content-type':'application/json' } });"""
)
replace_once(
    'tests/hotjob.test.js',
    """  assert.equal(result.stats.detailed, 1);
  assert.equal(detailCalls, 1);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Analyst - Business Consulting - SH');""",
    """  assert.equal(result.stats.detailed, 2);
  assert.equal(detailCalls, 2);
  assert.equal(result.jobs.length, 2);
  assert.deepEqual(new Set(result.jobs.map((job) => job.title)), new Set(['Analyst - Business Consulting - SH', '销售经理']));"""
)

# Durable architectural regression test.
boundary_test = ROOT / 'tests/discovery-boundary.test.js'
boundary_test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { shouldKeep } from '../scripts/job-discovery/core.mjs';

const profile = { graduationYear: '2027', roleKeywords: ['运营'], keywords: ['英语'], targetCities: ['深圳'], strongExclude: ['软件工程师', '销售经理'], minRelevanceScore: 99 };
const now = new Date('2026-09-16T00:00:00Z');

async function source(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('discovery gate keeps active formal 2027 roles regardless of candidate fit', () => {
  assert.equal(shouldKeep({ graduationYear: '2027', title: '软件工程师', city: '北京' }, profile, now), true);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '销售经理', city: '成都' }, profile, now), true);
  assert.equal(shouldKeep({ graduationYear: '2026', title: '海外运营' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营实习生' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营', deadline: '2026-09-01' }, profile, now), false);
});

test('production refresh does not invoke candidate-fit exclusion or enrichment', async () => {
  const [refresh, university] = await Promise.all([
    source('scripts/refresh-jobs.mjs'),
    source('scripts/job-discovery/refresh-university-jobs.mjs')
  ]);
  for (const text of [refresh, university]) {
    assert.doesNotMatch(text, /shouldExcludeByPolicy/);
    assert.doesNotMatch(text, /enrichCandidateFit/);
  }
});

test('university official bridge does not blacklist whole industries', async () => {
  const text = await source('scripts/job-discovery/university-official-bridge.mjs');
  assert.doesNotMatch(text, /EXCLUDED_CATEGORIES/);
  assert.doesNotMatch(text, /银行\\|证券\\|保险\\|信托\\|基金\\|期货\\|军工\\|审计\\|咨询/);
});
""", encoding='utf-8')
print('wrote tests/discovery-boundary.test.js')

print('final discovery boundary patch complete')
