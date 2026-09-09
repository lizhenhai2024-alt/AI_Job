const PROVIDER_RULES = [
  ['nowcoder', (job) => /牛客|nowcoder/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['moka', (job) => /moka|mokahr/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['beisen', (job) => /北森|zhiye\.com/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['feishu', (job) => /飞书|feishu\.cn|jobs\.feishu/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['hotjob', (job) => /hotjob|wecruit/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['anker', (job) => /安克创新官方|anker/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)],
  ['ecoflow', (job) => /ecoflow/i.test(`${job.source || ''} ${job.sourceUrl || ''}`)]
];

export function providerOfJob(job = {}) {
  for (const [provider, predicate] of PROVIDER_RULES) if (predicate(job)) return provider;
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
  // A configured provider reporting activity metrics but scanning/listing nothing is not a trustworthy replacement snapshot.
  const hasActivityMetric = ['listed','scannedRows','scannedPages','discoveredUrls','detailed','pages','portals']
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
