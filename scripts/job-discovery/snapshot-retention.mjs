import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const DEFAULT_RETENTION_DAYS = 14;

const PROVIDER_RULES = [
  ['nowcoder', (job) => /牛客|nowcoder/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['moka', (job) => /moka|mokahr/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['beisen', (job) => /北森|zhiye\.com/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['feishu', (job) => /飞书|feishu\.cn|jobs\.feishu/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['hotjob', (job) => /hotjob|wecruit/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['anker', (job) => /安克创新官方|anker/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['ecoflow', (job) => /ecoflow/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['alibaba', (job) => /阿里|alibaba/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['tencent', (job) => /腾讯|tencent/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['bytedance', (job) => /字节|bytedance|job\.bytedance/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['meituan', (job) => /美团|meituan/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['pinduoduo', (job) => /拼多多|pinduoduo|pdd/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['kuaishou', (job) => /快手|kuaishou/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['xiaohongshu', (job) => /小红书|xiaohongshu|rednote/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['ctrip', (job) => /携程|ctrip|trip\.com/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['oppo', (job) => /oppo|careers\.oppo\.com/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['topband', (job) => /拓邦|topband/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['job51', (job) => /前程无忧|51job|xyz\.51job/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['phenom', (job) => /phenom|pg\.com|pg\.com\.cn|mars\.com/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['avature', (job) => /avature|loreal|欧莱雅/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['successfactors', (job) => /successfactors|colgate|高露洁/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)]
];

export function providerOfJob(job = {}) {
  for (const [provider, predicate] of PROVIDER_RULES) {
    if (predicate(job)) return provider;
  }
  return '';
}

export function isSourceRefreshUnhealthy(result) {
  if (!result) return true;
  const stats = result.stats || {};
  const errors = Number(stats.errors || 0) + Number(stats.detailErrors || 0);
  const jobs = Array.isArray(result.jobs) ? result.jobs : [];
  if (errors > 0) return true;
  if (stats.snapshotComplete === false) return true;
  if (stats.emptyResult === true) return true;
  const hasActivityMetric = ['listed', 'scannedRows', 'scannedPages', 'discoveredUrls', 'detailed', 'pages', 'portals']
    .some((key) => Object.prototype.hasOwnProperty.call(stats, key));
  const activity = Number(stats.listed ?? stats.scannedRows ?? stats.scannedPages ?? stats.discoveredUrls ?? stats.detailed ?? stats.pages ?? 0);
  if (hasActivityMetric && activity <= 0 && jobs.length === 0) return true;
  return false;
}

// R-BEISEN-001：北森（zhiye.com）详情路由 GetJobAdInfo 需要岗位 UUID；数字 JobAdId 的详情 URL 一律"参数错误"。
// 快照保留不得把这类无效 URL 的历史条目捞回。
export function hasNumericBeisenDetailUrl(job = {}) {
  const urls = [String(job?.sourceUrl || ''), ...(Array.isArray(job?.sourceEvidence) ? job.sourceEvidence.map((e) => e?.url || '') : [])];
  return urls.some((url) => /zhiye\.com\/campus\/detail\?jobAdId=\d+(?:&|$)/i.test(url));
}

function asTime(value = '') {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

export function isRetentionFresh(job = {}, now = new Date(), maxAgeDays = DEFAULT_RETENTION_DAYS) {
  if (!job || job.closed) return false;
  if (job.deadline) {
    const deadline = new Date(`${job.deadline}T23:59:59+08:00`).getTime();
    if (Number.isFinite(deadline) && deadline < now.getTime()) return false;
  }
  const seenAt = [job.lastSeenAt, job.discoveredAt, job.publishedAt]
    .map(asTime)
    .find(Number.isFinite);
  if (!Number.isFinite(seenAt)) return false;
  const maxAgeMs = Math.max(1, Number(maxAgeDays) || DEFAULT_RETENTION_DAYS) * 86400000;
  return seenAt >= now.getTime() - maxAgeMs;
}

export function retainedJobsForUnhealthySources(existing = [], sourceResults = [], configuredProviders = [], {
  now = new Date(),
  maxAgeDays = DEFAULT_RETENTION_DAYS
} = {}) {
  const resultMap = new Map(sourceResults.map((result) => [result.name, result]));
  const providers = new Set(configuredProviders.filter(Boolean));
  for (const result of sourceResults) providers.add(result.name);
  const unhealthy = new Set([...providers].filter((provider) => isSourceRefreshUnhealthy(resultMap.get(provider))));
  const retained = existing.filter((job) => unhealthy.has(providerOfJob(job))
    && !hasNumericBeisenDetailUrl(job)
    && isRetentionFresh(job, now, maxAgeDays));
  return { retained, unhealthy: [...unhealthy].sort() };
}

export function parseLiveJobsModule(raw = '') {
  const text = String(raw || '');
  const marker = text.indexOf('export const liveJobs =');
  const start = text.indexOf('[', marker);
  const meta = text.indexOf('export const discoveryMeta', start);
  if (marker < 0 || start < 0) return [];
  const segment = meta > start ? text.slice(start, meta) : text.slice(start);
  const end = segment.lastIndexOf('];');
  if (end < 0) return [];
  try {
    return JSON.parse(segment.slice(0, end + 1));
  } catch {
    return [];
  }
}

export async function findHistoricalProviderJobs({
  root,
  provider,
  livePath = 'src/data/live-jobs.js',
  maxCommits = 12,
  now = new Date(),
  maxAgeDays = DEFAULT_RETENTION_DAYS
} = {}) {
  if (!root || !provider) return { jobs: [], commit: '' };
  let commits = [];
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--format=%H', '-n', String(maxCommits), '--', livePath],
      { cwd: root, maxBuffer: 2 * 1024 * 1024 }
    );
    commits = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return { jobs: [], commit: '' };
  }

  for (const commit of commits) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['show', `${commit}:${livePath}`],
        { cwd: root, maxBuffer: 32 * 1024 * 1024 }
      );
      const jobs = parseLiveJobsModule(stdout).filter((job) => providerOfJob(job) === provider
        && !hasNumericBeisenDetailUrl(job)
        && isRetentionFresh(job, now, maxAgeDays));
      if (jobs.length) return { jobs, commit };
    } catch {}
  }

  return { jobs: [], commit: '' };
}
