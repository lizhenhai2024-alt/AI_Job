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


replace_once(
    'scripts/job-discovery/core.mjs',
    '// 专业限制检测：排除有明确理工科/技术/特定专业门槛的岗位（文科/商科/语言类不可投）',
    '// 专业限制检测：仅作为情报信号，不参与 AI_Job 的发现/入库裁决。'
)
replace_once(
    'scripts/job-discovery/core.mjs',
    """export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  if (!hasRoleSignal(job, profile)) return false;
  if (hasMajorRestriction(job)) return false;
  return relevanceScore(job, profile) >= Number(profile.minRelevanceScore ?? 4);
}""",
    """// Discovery boundary: AI_Job keeps every active 2027 role it can verify.
// Candidate suitability, role direction, major fit and application priority belong downstream.
export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  return true;
}"""
)

replace_once(
    'scripts/refresh-jobs.mjs',
    "import { shouldExcludeByPolicy, jobPolicyReasons, enrichCandidateFit } from './job-discovery/policy.mjs';",
    "import { jobPolicyReasons, enrichCandidateFit } from './job-discovery/policy.mjs';"
)
replace_once(
    'scripts/refresh-jobs.mjs',
    """const liveBoardCandidates = candidateJobs
  .filter((job) => !job.excludeFromLiveBoard)
  .filter((job) => !shouldExcludeByPolicy(job))
  .map((job) => enrichCandidateFit(job, config))""",
    """const liveBoardCandidates = candidateJobs
  .filter((job) => !job.excludeFromLiveBoard)
  .map((job) => enrichCandidateFit(job, config))"""
)

replace_once(
    'scripts/job-discovery/refresh-university-jobs.mjs',
    "import { shouldExcludeByPolicy, enrichCandidateFit } from './policy.mjs';",
    "import { enrichCandidateFit } from './policy.mjs';"
)
replace_once(
    'scripts/job-discovery/refresh-university-jobs.mjs',
    """const freshUniversityJobs = curated
  .filter((job) => !job.excludeFromLiveBoard)
  .filter((job) => !shouldExcludeByPolicy(job))
  .map(enrichCandidateFit)""",
    """const freshUniversityJobs = curated
  .filter((job) => !job.excludeFromLiveBoard)
  .map(enrichCandidateFit)"""
)
replace_once(
    'scripts/job-discovery/refresh-university-jobs.mjs',
    ".filter((job) => !isClosed('', job.deadline, now) && !shouldExcludeByPolicy(job))",
    ".filter((job) => !isClosed('', job.deadline, now))"
)

replace_once(
    'scripts/job-discovery/university-official-bridge.mjs',
    """const EXCLUDED_CATEGORIES = /银行|证券|保险|信托|基金|期货|军工|审计|咨询/;
function isExcludedCompany(name, requests, jobKey) {
  const exists = requests.some((item) => canonicalCompanyKey(item?.name) === jobKey);
  if (exists) return false;
  const n = String(name || '').trim();
  if (/^\\d+\\./.test(n)) return true;
  return EXCLUDED_CATEGORIES.test(n);
}""",
    """function isExcludedCompany(name) {
  const n = String(name || '').trim();
  return /^\\d+\\./.test(n);
}"""
)

replace_once(
    'scripts/job-discovery/granularity.mjs',
    """export function isHighConfidenceMergedPosting(job = {}) {
  if (job.sourceType === 'official') return false;
  const title = String(job.title || '').trim();""",
    """export function isHighConfidenceMergedPosting(job = {}) {
  const title = String(job.title || '').trim();"""
)

replace_once(
    'tests/discovery.test.js',
    """test('official Moka technical role is still rejected by profile filter', () => {
  const job = parseMokaCard({ company: '示例公司', title: '软件工程师-北京', text: '2027届校园招聘', url: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/2' });
  assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), false);
});""",
    """test('official Moka technical role is retained for downstream eligibility', () => {
  const job = parseMokaCard({ company: '示例公司', title: '软件工程师-北京', text: '2027届校园招聘', url: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/2' });
  assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), true);
});"""
)
replace_once(
    'tests/discovery.test.js',
    """test('filters cohort and relevance while excluding technical roles', () => {
  const good = parseJobPage({ html: jobHtml(), url: 'https://www.nowcoder.com/jobs/detail/100003' });
  assert.ok(relevanceScore(good, profile) >= 4);
  assert.equal(shouldKeep(good, profile, new Date('2026-09-08T00:00:00Z')), true);
  const bad = { ...good, title: '软件工程师', roleFamily: ['其他'] };
  assert.equal(shouldKeep(bad, profile, new Date('2026-09-08T00:00:00Z')), false);
});""",
    """test('discovery gate keeps active 2027 roles regardless of candidate fit', () => {
  const good = parseJobPage({ html: jobHtml(), url: 'https://www.nowcoder.com/jobs/detail/100003' });
  assert.ok(relevanceScore(good, profile) >= 4);
  assert.equal(shouldKeep(good, profile, new Date('2026-09-08T00:00:00Z')), true);
  const technical = { ...good, title: '软件工程师', roleFamily: ['其他'] };
  assert.equal(shouldKeep(technical, profile, new Date('2026-09-08T00:00:00Z')), true);
});"""
)
replace_once(
    'tests/discovery.test.js',
    "assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), false);\n});\n\ntest('adjacent operations and brand titles are classified into usable role families'",
    "assert.equal(shouldKeep(job, profile, new Date('2026-09-08T00:00:00Z')), true);\n});\n\ntest('adjacent operations and brand titles are classified into usable role families'"
)
replace_once(
    'tests/discovery.test.js',
    """  const strictProfile = { ...profile, strongExclude: [...profile.strongExclude, '开发工程师'] };
  assert.equal(shouldKeep(job, strictProfile, new Date('2026-09-08T00:00:00Z')), false);""",
    """  const strictProfile = { ...profile, strongExclude: [...profile.strongExclude, '开发工程师'] };
  assert.equal(shouldKeep(job, strictProfile, new Date('2026-09-08T00:00:00Z')), true);"""
)

replace_once(
    'tests/granularity.test.js',
    """test('does not mistake a cohort-only suffix for a major requirement block', () => {""",
    """test('withholds high-confidence official multi-role aggregates pending concrete job resolution', () => {
  const input = {
    id: 'bulk-official',
    company: '示例集团',
    title: '销售跟单/业务运营/市场专员',
    graduationYear: '2027',
    sourceType: 'official'
  };
  assert.equal(isHighConfidenceMergedPosting(input), true);
  const [job] = curateJobGranularity(input);
  assert.equal(job.excludeFromLiveBoard, true);
  assert.equal(job.granularityStatus, 'needs_official_resolution');
});

test('does not mistake a cohort-only suffix for a major requirement block', () => {"""
)

replace_once(
    'README.md',
    '岗位粒度与硬门槛过滤',
    '岗位粒度校验 + 资格/语言/专业等信号标注（不按候选人适配删岗）'
)

print('discovery boundary migration complete')
