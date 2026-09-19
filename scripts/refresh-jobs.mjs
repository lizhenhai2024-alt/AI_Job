import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { searchNowcoderJobs } from './job-discovery/nowcoder.mjs';
import { searchLiepinCampus } from './job-discovery/liepin.mjs';
import { searchZhaopinJobs } from './job-discovery/zhaopin.mjs';
import { searchMokaJobs } from './job-discovery/moka.mjs';
import { searchBeisenJobs } from './job-discovery/beisen.mjs';
import { searchFeishuJobs } from './job-discovery/feishu.mjs';
import { searchHotjobJobs } from './job-discovery/hotjob.mjs';
import { searchAnkerJobs } from './job-discovery/anker.mjs';
import { searchEcoflowJobs } from './job-discovery/ecoflow.mjs';
import { searchAlibabaJobs } from './job-discovery/alibaba.mjs';
import { searchTencentJobs } from './job-discovery/tencent.mjs';
import { searchBytedanceJobs } from './job-discovery/bytedance.mjs';
import { searchMeituanJobs } from './job-discovery/meituan.mjs';
import { searchLenovoJobs } from './job-discovery/lenovo.mjs';
import { searchDjiJobs } from './job-discovery/dji.mjs';
import { searchMideaJobs } from './job-discovery/midea.mjs';
import { searchPinduoduoJobs } from './job-discovery/pinduoduo.mjs';
import { searchKuaishouJobs } from './job-discovery/kuaishou.mjs';
import { searchXiaohongshuJobs } from './job-discovery/xiaohongshu.mjs';
import { searchCtripJobs } from './job-discovery/ctrip.mjs';
import { searchOppoJobs } from './job-discovery/oppo.mjs';
import { searchTopbandJobs } from './job-discovery/topband.mjs';
import { search51JobCampus } from './job-discovery/job51.mjs';
import { searchPhenomJobs } from './job-discovery/phenom.mjs';
import { searchAvatureJobs } from './job-discovery/avature.mjs';
import { searchSuccessFactorsJobs } from './job-discovery/successfactors.mjs';
import { isClosed } from './job-discovery/core.mjs';
import { enrichProvenanceFields } from '../src/core/source-provenance.js';
import { buildSourceHealth } from './job-discovery/source-health.mjs';
import { curateDiscoveredJobs, curatedOfficialGranularityJobs } from './job-discovery/granularity.mjs';
import { retainedJobsForUnhealthySources, providerOfJob, findHistoricalProviderJobs, hasNumericBeisenDetailUrl } from './job-discovery/snapshot-retention.mjs';
import { preferFresh } from './job-discovery/dedupe.mjs';
import { dedupeById } from './job-discovery/dedupe.mjs';
import { resolveJdEvidence } from './job-discovery/policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));
const officialSources = JSON.parse(await fs.readFile(path.join(root, 'config/official-sources.json'), 'utf8'));
const livePath = path.join(root, 'src/data/live-jobs.js');
const sourceHealthPath = path.join(root, 'src/data/source-health.js');

const MAX_CONCURRENCY = 3;
const SUPPORTED_PROVIDERS = [
  'nowcoder', 'liepin', 'zhaopin', 'moka', 'beisen', 'feishu', 'hotjob', 'anker', 'ecoflow',
  'alibaba', 'tencent', 'bytedance', 'meituan', 'lenovo', 'dji', 'midea', 'pinduoduo', 'kuaishou',
  'xiaohongshu', 'ctrip', 'oppo', 'topband', 'job51', 'phenom', 'avature',
  'successfactors'
];

async function runWithConcurrency(tasks, maxConcurrency = MAX_CONCURRENCY, taskTimeoutMs = 10 * 60 * 1000) {
  const results = new Array(tasks.length);
  let index = 0;

  // 单个 task 超时兜底：防止某个 provider 的 Promise 永不 settle 拖垮整个刷新管线
  // （2026-09-16 实测 liepin/zhaopin 单独跑正常，但并发刷新时整管线挂起，Node 报 unsettled top-level await）
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`task timeout after ${ms}ms: ${label}`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      try {
        const value = await withTimeout(task.fn(), taskTimeoutMs, task.name || `task#${currentIndex}`);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (error) {
        console.warn(`[job-refresh] task ${task.name || currentIndex} failed/timeout: ${error.message}`);
        results[currentIndex] = { status: 'rejected', reason: error };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, Math.max(tasks.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function loadExisting() {
  try {
    const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
    return Array.isArray(mod.liveJobs) ? mod.liveJobs : [];
  } catch (error) {
    // Returning [] silently is how a corrupt/partial pool (or a writer that left
    // the file mid-write) turns into "there was no previous snapshot": retention
    // and evidence merging then have nothing to work against, and this run's
    // scrapes become the whole pool.
    console.warn(`[job-refresh] previous live-jobs.js could not be loaded (${error?.message || error}); starting from an empty pool`);
    return [];
  }
}

function cleanForStorage(job) {
  const {
    _searchText,
    _category,
    _subject,
    _sourceJobId,
    _recruitType,
    closed,
    excludeFromLiveBoard,
    candidateFit,
    jdEvidence,
    ...clean
  } = job;
  if (Array.isArray(clean.riskTags)) clean.riskTags = clean.riskTags.filter((tag) => !String(tag).startsWith('适配风险：'));
  // 传原始 job：它仍带 _searchText（上面才解构掉）和 candidateFit，
  // resolveJdEvidence 需要这两者来决定重算 / 保留 / 迁移。
  return { ...clean, jdEvidence: resolveJdEvidence(job) };
}

function asModule(jobs, meta) {
  const jobsJson = JSON.stringify(jobs, null, 2).replace(/\n]$/, '\n];').replace(/]$/, '];');
  const metaJson = JSON.stringify(meta, null, 2).replace(/\n}$/, '\n};').replace(/}$/, '};');
  return `// AUTO-GENERATED by scripts/refresh-jobs.mjs.\nexport const liveJobs = ${jobsJson}\n\nexport const discoveryMeta = ${metaJson}\n`;
}

function healthModule(health, updatedAt) {
  return `// AUTO-GENERATED by scripts/refresh-jobs.mjs.\nexport const sourceHealth = ${JSON.stringify({ ...health, updatedAt }, null, 2)};\n`;
}

function dedupePreferOfficial(jobs = []) {
  const rank = (job) => job?.sourceType === 'official' ? 2 : job?.sourceType === 'secondary' ? 1 : 0;
  const map = new Map();

  for (const job of jobs) {
    if (!job?.id) continue;
    const key = `${String(job.company || '').trim().toLowerCase()}|${String(job.title || '').replace(/[\s【】〖〗()（）\-_]/g, '').toLowerCase()}|${String(job.city || '').trim().toLowerCase()}`;
    const previous = map.get(key);
    if (
      !previous
      || rank(job) > rank(previous)
      || (rank(job) === rank(previous) && String(job.publishedAt || '') > String(previous.publishedAt || ''))
      || Boolean(previous._snapshotRetained && !job._snapshotRetained)
    ) {
      map.set(key, job);
    }
  }

  return [...map.values()];
}

function sourceConfigured(provider) {
  if (provider === 'nowcoder' || provider === 'liepin' || provider === 'zhaopin') return true;
  const value = officialSources?.[provider];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function logSourceResult(name, result) {
  const stats = result?.stats || {};
  const parts = [];
  if (stats.portals !== undefined) parts.push(`portals=${stats.scannedPortals}/${stats.portals}`);
  if (stats.discoveredUrls !== undefined) parts.push(`discovered=${stats.discoveredUrls}`);
  if (stats.scannedPages !== undefined) parts.push(`scanned=${stats.scannedPages}`);
  if (stats.scannedRows !== undefined) parts.push(`rows=${stats.scannedRows}`);
  if (stats.listed !== undefined) parts.push(`listed=${stats.listed}`);
  if (stats.detailed !== undefined) parts.push(`detailed=${stats.detailed}`);
  if (stats.pages !== undefined) parts.push(`pages=${stats.pages}`);
  parts.push(`kept=${Number(stats.keptJobs || 0)}`);
  parts.push(`errors=${Number(stats.errors || 0) + Number(stats.detailErrors || 0)}`);
  if (stats.snapshotComplete !== undefined) parts.push(`complete=${stats.snapshotComplete}`);
  console.log(`[job-refresh:${name}] ${parts.join(' ')}`);
}

function adapterOptions(source = {}) {
  return {
    maxJobs: source.maxJobs,
    pageSize: source.pageSize,
    maxPages: source.maxPages
  };
}

function normalizedSource(provider, source = {}) {
  const normalized = { ...source };

  // Source entries are allowed to inherit the global target cohort and to use
  // baseUrl when an adapter's historical schema did not require a url field.
  if (!normalized.url && normalized.baseUrl) normalized.url = normalized.baseUrl;
  if (!normalized.graduationYear && config.graduationYear) normalized.graduationYear = config.graduationYear;

  // Topband's token is encoded in the configured website path.
  if (provider === 'topband' && !normalized.token) {
    const parts = String(normalized.websitePath || '').split('/').filter(Boolean);
    normalized.token = parts.at(-1) || '';
  }

  return normalized;
}

function normalizedSources(provider) {
  const configured = officialSources?.[provider];
  const sources = Array.isArray(configured) ? configured : configured ? [configured] : [];
  return sources.map((source) => normalizedSource(provider, source));
}

function aggregateNumericStats(target, stats = {}) {
  const numericKeys = [
    'pages', 'listed', 'detailed', 'scannedRows', 'scannedPages',
    'discoveredUrls', 'keptJobs', 'errors', 'detailErrors',
    'internRejected', 'socialRejected', 'cohortMatched'
  ];
  for (const key of numericKeys) {
    if (stats[key] !== undefined) {
      target[key] = Number(target[key] || 0) + Number(stats[key] || 0);
    }
  }
}

async function searchConfiguredSourceList(provider, searcher) {
  const sources = normalizedSources(provider);
  const jobs = [];
  const perPortal = {};
  const aggregate = { keptJobs: 0, errors: 0, snapshotComplete: true, perPortal };

  for (const source of sources) {
    let result;

    try {
      result = await searcher(config, source, adapterOptions(source));
    } catch (error) {
      result = {
        jobs: [],
        stats: {
          errors: 1,
          keptJobs: 0,
          snapshotComplete: false,
          error: String(error?.message || error)
        }
      };
    }

    jobs.push(...(Array.isArray(result?.jobs) ? result.jobs : []));
    const stats = result?.stats || {};
    perPortal[source.company || source.baseUrl || source.url || 'unknown'] = stats;
    aggregateNumericStats(aggregate, stats);
    if (stats.snapshotComplete === false || Number(stats.errors || 0) > 0 || Number(stats.detailErrors || 0) > 0) {
      aggregate.snapshotComplete = false;
    }
  }

  aggregate.keptJobs = jobs.length;
  if (!sources.length) aggregate.snapshotComplete = false;
  return { jobs, stats: aggregate };
}

function addParallelTask(tasks, name, fn) {
  if (!sourceConfigured(name)) return;
  tasks.push({
    name,
    fn: async () => {
      console.log(`[job-refresh:${name}] starting`);
      const result = await fn();
      logSourceResult(name, result);
      return result;
    }
  });
}

const existing = await loadExisting();
const sourceResults = [];
let chromium = null;
try {
  chromium = (await import('playwright')).chromium;
} catch {}

console.log(`[job-refresh] starting refresh with concurrency=${MAX_CONCURRENCY}`);

if (sourceConfigured('moka')) {
  try {
    if (!chromium) throw new Error('Playwright Chromium unavailable');
    console.log('[job-refresh:moka] starting (Playwright, isolated)');
    const result = await searchMokaJobs(config, normalizedSources('moka'), { chromium });
    sourceResults.push({ name: 'moka', ...result });
    logSourceResult('moka', result);
  } catch (error) {
    console.warn(`[job-refresh:moka] failed: ${error.message}`);
  }
}

if (sourceConfigured('bytedance')) {
  try {
    if (!chromium) throw new Error('Playwright Chromium unavailable');
    console.log('[job-refresh:bytedance] starting (Playwright, isolated)');
    const source = normalizedSource('bytedance', officialSources.bytedance);
    const result = await searchBytedanceJobs(config, source, adapterOptions(source));
    sourceResults.push({ name: 'bytedance', ...result });
    logSourceResult('bytedance', result);
  } catch (error) {
    console.warn(`[job-refresh:bytedance] failed: ${error.message}`);
  }
}

const parallelTasks = [];

addParallelTask(parallelTasks, 'nowcoder', () => searchNowcoderJobs(config));
addParallelTask(parallelTasks, 'liepin', () => searchLiepinCampus(config));
addParallelTask(parallelTasks, 'zhaopin', () => searchZhaopinJobs(config));
addParallelTask(parallelTasks, 'beisen', () => searchBeisenJobs(config, normalizedSources('beisen')));
addParallelTask(parallelTasks, 'feishu', () => searchFeishuJobs(config, normalizedSources('feishu')));
addParallelTask(parallelTasks, 'hotjob', () => searchHotjobJobs(config, normalizedSources('hotjob')));

for (const [provider, searcher] of [
  ['anker', searchAnkerJobs],
  ['ecoflow', searchEcoflowJobs],
  ['alibaba', searchAlibabaJobs],
  ['tencent', searchTencentJobs],
  ['meituan', searchMeituanJobs],
  ['lenovo', searchLenovoJobs],
  ['dji', searchDjiJobs],
  ['midea', searchMideaJobs],
  ['pinduoduo', searchPinduoduoJobs],
  ['kuaishou', searchKuaishouJobs],
  ['xiaohongshu', searchXiaohongshuJobs],
  ['ctrip', searchCtripJobs],
  ['oppo', searchOppoJobs]
]) {
  addParallelTask(parallelTasks, provider, () => {
    const source = normalizedSource(provider, officialSources[provider]);
    // chromium 供 lenovo/dji 等适配器在直连被 WAF 拦截时走 Playwright 渲染回退（Runner 可靠通道）。
    return searcher(config, source, { ...adapterOptions(source), chromium });
  });
}

for (const [provider, searcher] of [
  ['topband', searchTopbandJobs],
  ['job51', search51JobCampus],
  ['phenom', searchPhenomJobs],
  ['avature', searchAvatureJobs],
  ['successfactors', searchSuccessFactorsJobs]
]) {
  addParallelTask(
    parallelTasks,
    provider,
    () => searchConfiguredSourceList(provider, searcher)
  );
}

console.log(`[job-refresh] running ${parallelTasks.length} sources in parallel (concurrency=${MAX_CONCURRENCY})`);
const parallelResults = await runWithConcurrency(parallelTasks, MAX_CONCURRENCY);

for (let i = 0; i < parallelTasks.length; i++) {
  const task = parallelTasks[i];
  const result = parallelResults[i];

  if (result.status === 'fulfilled') {
    sourceResults.push({ name: task.name, ...result.value });
  } else {
    console.warn(`[job-refresh:${task.name}] failed: ${result.reason?.message || result.reason}`);
  }
}

const configuredProviders = SUPPORTED_PROVIDERS.filter(sourceConfigured);
console.log(`[job-refresh] all sources completed: ${sourceResults.length}/${configuredProviders.length} successful`);

const snapshotRetention = retainedJobsForUnhealthySources(existing, sourceResults, configuredProviders);
let retainedSourceJobs = [...snapshotRetention.retained].map((job) => ({ ...job, _snapshotRetained: true }));

for (const provider of snapshotRetention.unhealthy) {
  if (retainedSourceJobs.some((job) => providerOfJob(job) === provider)) continue;
  const historical = await findHistoricalProviderJobs({ root, provider });
  const cleanHistorical = historical.jobs.filter((job) => !hasNumericBeisenDetailUrl(job));
  if (cleanHistorical.length) {
    retainedSourceJobs.push(...cleanHistorical.map((job) => ({ ...job, _snapshotRetained: true })));
    const dropped = historical.jobs.length - cleanHistorical.length;
    console.warn(`[job-refresh:${provider}] unhealthy snapshot; recovered ${cleanHistorical.length} jobs from ${historical.commit.slice(0, 8)}${dropped ? ` (dropped ${dropped} numeric Beisen URLs)` : ''}`);
  }
}

if (snapshotRetention.unhealthy.length) {
  console.warn(`[job-refresh] unhealthySources=${snapshotRetention.unhealthy.join(',')} retainedSourceJobs=${retainedSourceJobs.length}`);
}

const discoveredJobs = curateDiscoveredJobs(sourceResults.flatMap((result) => result.jobs || []));
const verifiedConcreteJobs = curatedOfficialGranularityJobs();
const candidateJobs = [...discoveredJobs, ...verifiedConcreteJobs];
const granularityExcluded = candidateJobs.filter((job) => job.excludeFromLiveBoard).length;

const liveBoardCandidates = candidateJobs
  .filter((job) => !job.excludeFromLiveBoard)
  .map((job) => enrichProvenanceFields(job));

const deduped = dedupeById(dedupePreferOfficial([...liveBoardCandidates, ...retainedSourceJobs]));
// moka 保底：moka 源岗位是"同标题族多投递方向"结构，任何中间去重都不得压没唯一投递方向。
// 若最终岗位中某 moka 岗位缺失（被 title 合并等），按 id 从抓取结果补回。
const mokaGuardJobs = (sourceResults.find((r) => r.name === 'moka')?.jobs || []);
const mokaGuardMap = new Map(mokaGuardJobs.map((j) => [j.id, j]));
for (const job of deduped) if (mokaGuardMap.has(job.id)) mokaGuardMap.delete(job.id);
console.log('[moka-guard] 抓取=' + mokaGuardJobs.length + ' 终审前=' + deduped.length + ' 保底补回=' + mokaGuardMap.size);
const finalJobsPre = [...deduped, ...mokaGuardMap.values()];
const finalJobs = finalJobsPre
  .filter((job) => !isClosed('', job.deadline))
  .sort(
    (a, b) =>
      String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
      || String(b.company || '').localeCompare(String(a.company || ''))
  );

const sourceStatsByProvider = Object.fromEntries(
  sourceResults.map((result) => [result.name, result.stats || {}])
);
const configuredOfficialSources = Object.fromEntries(
  Object.entries(officialSources).filter(([provider]) => configuredProviders.includes(provider))
);
const sourceHealth = buildSourceHealth(sourceStatsByProvider, configuredOfficialSources);

const meta = {
  updatedAt: new Date().toISOString(),
  totalJobs: finalJobs.length,
  totalCompanies: new Set(finalJobs.map((job) => job.company)).size,
  sources: sourceResults.map((result) => ({
    name: result.name,
    kept: (result.jobs || []).length,
    errors: Number(result.stats?.errors || 0) + Number(result.stats?.detailErrors || 0)
  })),
  granularityExcluded,
  unhealthySources: snapshotRetention.unhealthy,
  retainedJobs: retainedSourceJobs.length
};

await fs.writeFile(livePath, asModule(finalJobs.map(cleanForStorage), meta), 'utf8');
await fs.writeFile(sourceHealthPath, healthModule(sourceHealth, meta.updatedAt), 'utf8');

console.log(`[job-refresh] DONE jobs=${finalJobs.length} companies=${meta.totalCompanies} sources=${sourceResults.length}`);
console.log(`[job-refresh] written to ${path.relative(root, livePath)} and ${path.relative(root, sourceHealthPath)}`);
