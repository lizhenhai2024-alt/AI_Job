import { searchFeishuJobs } from './feishu.mjs';

const PROBE_PROFILE = {
  graduationYear: '2027',
  roleKeywords: ['运营','市场','商务','产品','项目','供应链','销售','财务','人力','研发','技术'],
  keywords: ['2027','校招'],
  targetCities: [],
  strongExclude: [],
  minRelevanceScore: 0
};

export async function probeFeishuSource(source = {}, { fetcher = fetch, now = new Date() } = {}) {
  const probeSource = {
    company: source.company || 'source-discovery',
    baseUrl: source.baseUrl,
    websitePath: source.websitePath,
    detailTemplate: source.detailTemplate || '',
    pageSize: Math.max(1, Math.min(Number(source.pageSize || 100), 100)),
    maxPages: Math.max(1, Math.min(Number(source.maxPages || 3), 3)),
    maxJobs: Math.max(1, Math.min(Number(source.maxJobs || 300), 300))
  };

  const result = await searchFeishuJobs(PROBE_PROFILE, [probeSource], { fetcher, now });
  const stats = result.stats?.perPortal?.[probeSource.company] || {};
  const listed = Number(stats.listed || 0);
  const cohortMatched = Number(stats.cohortMatched || 0);
  const internRejected = Number(stats.internRejected || 0);
  const socialRejected = Number(stats.socialRejected || 0);
  const nonInternCohort = Math.max(0, cohortMatched - internRejected - socialRejected);

  if (Number(stats.errors || 0) > 0) {
    return {
      ok: false,
      listed,
      cohortMatched,
      nonInternCohort,
      reason: stats.error || '飞书生产抓取探针失败'
    };
  }
  if (listed <= 0) {
    return { ok: false, listed: 0, cohortMatched, nonInternCohort, reason: '飞书源当前返回 0 个岗位' };
  }
  return {
    ok: true,
    total: listed,
    listed,
    cohortMatched,
    nonInternCohort,
    reason: ''
  };
}
