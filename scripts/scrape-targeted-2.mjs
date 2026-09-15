// Targeted batch #2: 国科微电子 / 鹏芯微 (beisen) + TCL华星光电 (hotjob).
//
//   node scripts/scrape-targeted-2.mjs
//
// TCL华星: the configured HotJob tenant serves the whole TCL campus pool (440
// rows). Rows carry a `company` field per BU, so we list all rows, keep only
// CSOT-related organizations (华星/泛智屏/大显示), then reuse the official
// adapter's parseHotjobDetail so the JD enrichment path is identical.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { searchBeisenJobs } from './job-discovery/beisen.mjs';
import { parseHotjobDetail } from './job-discovery/hotjob.mjs';
import { shouldKeep, classifyRole, detectSkills, dedupeJobs, CITY_NAMES } from './job-discovery/core.mjs';
import { isClosed } from './job-discovery/core.mjs';
import { shouldExcludeByPolicy, enrichCandidateFit } from './job-discovery/policy.mjs';
import { enrichProvenanceFields } from '../src/core/source-provenance.js';
import { curateDiscoveredJobs } from './job-discovery/granularity.mjs';
import { dedupeById } from './job-discovery/dedupe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));
const officialSources = JSON.parse(await fs.readFile(path.join(root, 'config/official-sources.json'), 'utf8'));
const livePath = path.join(root, 'src/data/live-jobs.js');

const TARGETS = [
  { company: '国科微电子股份有限公司', provider: 'beisen' },
  { company: '深圳市鹏芯微集成电路制造有限公司', provider: 'beisen' },
  { company: 'TCL华星光电', provider: 'hotjob' }
];
// Existing secondary placeholder uses the longer name; remove both.
const TARGET_PATTERNS = [/^TCL华星光电/, ...TARGETS.map((t) => new RegExp(`^${t.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))];
const isTargetCompany = (name = '') => TARGET_PATTERNS.some((re) => re.test(name));

const CSOT_ORG_RX = /华星|泛智屏|大显示/;
const INTERNSHIP_RX = /实习|兼职|part[- ]?time|\bIntern(?:ship)?\b/i;
const PURE_SALES_RX = /销售管培生|销售代表|销售专员|销售顾问|销售经理|海外销售|国际销售|渠道销售|区域销售|大客户销售/i;
const NON_PURE_SALES_RX = /销售运营|销售支持|销售分析|销售策略|销售计划|销售管理|商务运营/i;

function normalizeSource(source = {}) {
  const normalized = { ...source };
  if (!normalized.url && normalized.baseUrl) normalized.url = normalized.baseUrl;
  if (!normalized.graduationYear && config.graduationYear) normalized.graduationYear = config.graduationYear;
  return normalized;
}

function findSource(company, provider) {
  const list = officialSources?.[provider] || [];
  return list.find((s) => s.company === company) || null;
}

// --- TCL华星: custom list + CSOT-org filter, same per-row logic as hotjob.mjs ---
function cleanText(value = '') {
  return String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}
function normalizeDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}
function cityOf(text = '') {
  const raw = cleanText(text);
  return CITY_NAMES.find((name) => raw.includes(name)) || raw || '待核';
}

async function postHotjob(action, source, data) {
  const key = `SU${String(source.tenant || '').replace(/^SU/i, '')}`;
  const base = String(source.baseUrl || '').replace(/\/$/, '');
  const res = await fetch(`${base}/wecruit/positionInfo/${action}/${key}?iSaJAx=isAjax&request_locale=zh_CN&t=${Date.now()}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'Mozilla/5.0',
      referer: `${base}/${key}/pb/school.html`,
      origin: base
    },
    body: new URLSearchParams(data).toString()
  });
  if (!res.ok) throw new Error(`HotJob HTTP ${res.status} ${action}`);
  const payload = JSON.parse(await res.text());
  if (String(payload?.state) !== '200') throw new Error(payload?.msg || `state=${payload?.state}`);
  return payload.data || {};
}

async function scrapeTclCsot(source) {
  const stats = { listed: 0, csotRows: 0, candidates: 0, detailed: 0, kept: 0, errors: 0, nonCsotOrgs: {} };
  const jobs = [];

  const first = await postHotjob('listPosition', source, { isFrompb: 'true', recruitType: '1', pageSize: '50', currentPage: '1' });
  const totalPage = Number(first?.pageForm?.totalPage || 1);
  const rows = [...(first?.pageForm?.pageData || [])];
  for (let p = 2; p <= Math.min(totalPage, Number(source.maxPages || 20)); p++) {
    const page = await postHotjob('listPosition', source, { isFrompb: 'true', recruitType: '1', pageSize: '50', currentPage: String(p) });
    rows.push(...(page?.pageForm?.pageData || []));
  }
  stats.listed = rows.length;

  const csotRows = rows.filter((row) => CSOT_ORG_RX.test(String(row.company || '')));
  stats.csotRows = csotRows.length;
  for (const row of rows) {
    if (!CSOT_ORG_RX.test(String(row.company || ''))) stats.nonCsotOrgs[row.company] = (stats.nonCsotOrgs[row.company] || 0) + 1;
  }

  const now = new Date();
  for (const row of csotRows) {
    try {
      const title = cleanText(row.postName || '');
      if (!title || INTERNSHIP_RX.test(`${title} ${row.workTypeStr || ''} ${row.projectName || ''}`)) continue;
      if (PURE_SALES_RX.test(title) && !NON_PURE_SALES_RX.test(title)) continue;
      // Mirror hotjob.mjs isListCandidate: thin-card shouldKeep prefilter.
      const rough = {
        title,
        company: source.company,
        city: cityOf(row.workPlaceStr || row.department || ''),
        graduationYear: '2027',
        roleFamily: classifyRole(title),
        skills: detectSkills(`${title} ${row.postTypeName || ''} ${row.projectName || ''}`),
        _searchText: [title, row.postTypeName, row.company, row.department, row.projectName].filter(Boolean).join(' '),
        deadline: normalizeDate(row.endDate),
        closed: false
      };
      if (!shouldKeep(rough, config, now)) continue;
      stats.candidates++;

      const detail = await postHotjob('listPositionDetail', source, { postId: String(row.postId || '') });
      stats.detailed++;
      const job = parseHotjobDetail(source, row, detail, now);
      // Tag the CSOT org on the job for provenance; company field stays source.company.
      job._csotOrg = cleanText(row.company || '');
      if (shouldKeep(job, config, now)) jobs.push(job);
    } catch {
      stats.errors++;
    }
  }
  stats.kept = jobs.length;
  return { jobs: dedupeJobs(jobs), stats };
}

function cleanForStorage(job) {
  const {
    _searchText, _category, _subject, _sourceJobId, _recruitType, closed, excludeFromLiveBoard, _csotOrg,
    ...clean
  } = job;
  return clean;
}

function asModule(jobs, meta) {
  const jobsJson = JSON.stringify(jobs, null, 2).replace(/\n]$/, '\n];').replace(/]$/, '];');
  const metaJson = JSON.stringify(meta, null, 2).replace(/\n}$/, '\n};').replace(/}$/, '};');
  return `// AUTO-GENERATED by scripts/refresh-jobs.mjs.\nexport const liveJobs = ${jobsJson}\n\nexport const discoveryMeta = ${metaJson}\n`;
}

function dedupePreferOfficial(jobs = []) {
  const rank = (job) => job?.sourceType === 'official' ? 2 : job?.sourceType === 'secondary' ? 1 : 0;
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    const key = `${String(job.company || '').trim().toLowerCase()}|${String(job.title || '').replace(/[\s【】〖〗()（）\-_]/g, '').toLowerCase()}|${String(job.city || '').trim().toLowerCase()}`;
    const previous = map.get(key);
    if (!previous || rank(job) > rank(previous) || (rank(job) === rank(previous) && String(job.publishedAt || '') > String(previous.publishedAt || ''))) map.set(key, job);
  }
  return [...map.values()];
}

async function loadExisting() {
  try {
    const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
    return { liveJobs: Array.isArray(mod.liveJobs) ? mod.liveJobs : [], meta: mod.discoveryMeta || {} };
  } catch {
    return { liveJobs: [], meta: {} };
  }
}

// --- Scrape ---
const report = [];
const freshJobs = [];

for (const target of TARGETS) {
  const source = findSource(target.company, target.provider);
  const row = { company: target.company, provider: target.provider, raw: 0, kept: 0, status: 'ok', error: null, stats: null };
  if (!source) {
    row.status = 'missing_source_config';
    row.error = `official-sources.json 未找到 ${target.company}`;
    report.push(row);
    console.warn(`[scrape-targeted-2] ${target.company}: ${row.error}`);
    continue;
  }
  const normalized = normalizeSource(source);
  try {
    let result;
    if (target.provider === 'beisen') {
      result = await searchBeisenJobs(config, [normalized]);
    } else {
      result = await scrapeTclCsot(normalized);
    }
    const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
    row.raw = jobs.length;
    row.stats = result?.stats || null;
    freshJobs.push(...jobs);
    console.log(`[scrape-targeted-2] ${target.company}: raw=${jobs.length} stats=${JSON.stringify(result?.stats)}`);
  } catch (error) {
    row.status = 'failed';
    row.error = String(error?.message || error);
    console.warn(`[scrape-targeted-2] ${target.company} FAILED: ${row.error}`);
  }
  report.push(row);
}

// --- Same pipeline ---
const curated = curateDiscoveredJobs(freshJobs);
const pipelineKept = curated
  .filter((j) => !j.excludeFromLiveBoard)
  .filter((j) => !shouldExcludeByPolicy(j))
  .map((j) => enrichCandidateFit(j, config))
  .map((j) => enrichProvenanceFields(j))
  .filter((j) => !isClosed('', j.deadline));

for (const row of report) {
  row.kept = pipelineKept.filter((j) => j.company === row.company).length;
}

// --- Merge: drop existing rows for the companies that were re-read ---
const { liveJobs: existing, meta: existingMeta } = await loadExisting();
// A failed scrape means "we do not know this company's current state", not "this
// company has no jobs". Only drop rows for targets we actually re-read, otherwise
// a failure silently deletes them from the production pool.
const rescraped = new Set(report.filter((r) => r.status !== 'failed').map((r) => r.company));
const removed = existing.filter((j) => rescraped.has(j.company));
const untouched = existing.filter((j) => !rescraped.has(j.company));
console.log(`[scrape-targeted-2] existing=${existing.length} removedTargetRows=${removed.length} untouched=${untouched.length} fresh=${pipelineKept.length}`);
for (const r of removed.slice(0, 10)) console.log(`  removed: ${r.company} | ${r.title} | ${r.sourceType}`);

const combined = [...untouched, ...pipelineKept];
const deduped = dedupeById(dedupePreferOfficial(combined));
const finalJobs = deduped
  .sort(
    (a, b) =>
      String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
      || String(b.company || '').localeCompare(String(a.company || ''))
  );

const meta = {
  ...existingMeta,
  updatedAt: new Date().toISOString(),
  totalJobs: finalJobs.length,
  totalCompanies: new Set(finalJobs.map((j) => j.company)).size,
  targetedRefresh2: {
    runAt: new Date().toISOString(),
    removedTargetRows: removed.length,
    companies: report.map((r) => ({
      company: r.company,
      provider: r.provider,
      status: r.status,
      raw: r.raw,
      kept: r.kept,
      error: r.error,
      stats: r.stats
    }))
  }
};

await fs.writeFile(livePath, asModule(finalJobs.map(cleanForStorage), meta), 'utf8');

console.log('\n[scrape-targeted-2] SUMMARY');
for (const row of report) {
  console.log(`  - ${row.company} (${row.provider}): status=${row.status} raw=${row.raw} kept=${row.kept}${row.error ? ' error=' + row.error : ''}`);
}
console.log(`[scrape-targeted-2] DONE jobs=${finalJobs.length} companies=${meta.totalCompanies} -> ${path.relative(root, livePath)}`);

// Report failure through the exit code; the summary above is easy to miss in CI logs.
const failed = report.filter((row) => row.status === 'failed');
if (failed.length) {
  console.error(`[scrape-targeted-2] ${failed.length}/${report.length} target(s) failed: ${failed.map((row) => row.company).join(', ')}; their existing rows were left untouched.`);
  process.exitCode = 1;
}
