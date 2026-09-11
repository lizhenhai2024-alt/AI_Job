import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export function retainedJobsForUnhealthySources(existing = [], sourceResults = [], configuredProviders = []) {
  const resultMap = new Map(sourceResults.map((result) => [result.name, result]));
  const providers = new Set(configuredProviders.filter(Boolean));
  for (const result of sourceResults) providers.add(result.name);
  const unhealthy = new Set([...providers].filter((provider) => isSourceRefreshUnhealthy(resultMap.get(provider))));
  const retained = existing.filter((job) => unhealthy.has(providerOfJob(job)));
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

export async function findHistoricalProviderJobs({ root, provider, livePath = 'src/data/live-jobs.js', maxCommits = 12 } = {}) {
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
      const jobs = parseLiveJobsModule(stdout).filter((job) => providerOfJob(job) === provider);
      if (jobs.length) return { jobs, commit };
    } catch {}
  }

  return { jobs: [], commit: '' };
}
