import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','管培','多语种','翻译','招聘'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['法语', /法语|French/i], ['德语', /德语|German/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i], ['俄语', /俄语|Russian/i], ['阿拉伯语', /阿语|阿拉伯语|Arabic/i]
];
// Default 2027届校招（应届）招聘子项目代码；可被 source.recruitSubProjectCode 覆盖。
const DEFAULT_SUB_PROJECT = '20271779425607';

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cityOf(row = {}) {
  const dicts = Array.isArray(row.workLocationDicts) ? row.workLocationDicts.map((x) => clean(x?.name)).filter(Boolean) : [];
  const raw = dicts.join('、');
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

function publishedAt(row = {}) {
  const raw = clean(row.releaseTime || '');
  const m = raw.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function directUrl(source, id) {
  return id ? `${source.url}#/campus/jobDetail?positionId=${encodeURIComponent(id)}` : source.url;
}

export function parseKuaishouJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || row.code || '');
  const title = clean(row.name || row.title || '');
  const duty = clean(row.description || '');
  const demand = clean(row.positionDemand || '');
  const category = clean(row.positionCategoryName || '');
  const jobText = [title, category, duty, demand].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const languages = LANGUAGE_RULES.filter(([, rx]) => rx.test(jobText)).map(([name]) => name);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|多语种|海外用户|海外市场/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境|多语种/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `kuaishou-${crypto.createHash('sha1').update(`${rawId}|${title}|${cityOf(row)}`).digest('hex').slice(0, 12)}`,
    company: source.company || '快手',
    title,
    roleFamily,
    city: cityOf(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages,
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '快手官方2027校招官网',
    sourceType: 'official',
    sourceUrl: directUrl(source, String(row.code || rawId)),
    verification: '官方招聘官网/API',
    publishedAt: publishedAt(row),
    deadline: '',
    description: `快手官方2027校园招聘岗位；${category ? `职类：${category}。` : ''}${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),    jobDescription: row.description || '',
    jobRequirements: row.requirement || '',

    _searchText: jobText,
    _sourceJobId: rawId
  };
}

async function postJson(fetcher, url, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.7)'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchKuaishouJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false, emptyResult: true } };
  const apiBase = 'https://campus.kuaishou.cn';
  const listUrl = `${apiBase}/recruit/campus/e/api/v1/open/positions/simple`;
  const subProject = source.recruitSubProjectCode || DEFAULT_SUB_PROJECT;
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 20), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 60), 100));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  const timeoutMs = 15000;
  let pages = 0, listed = 0, detailed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();
  let total = Infinity;

  try {
    for (let pageNum = 1; pageNum <= pageLimit && seen.size < jobLimit && listed < total; pageNum++) {
      const payload = await postJson(fetcher, listUrl, { recruitSubProjectCodes: [subProject], pageSize: size, pageNum }, timeoutMs);
      if (Number(payload?.code) !== 0) throw new Error(payload?.message || 'bad Kuaishou payload');
      pages++;
      const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
      total = Number(payload?.result?.total || rows.length);
      listed += rows.length;
      let added = 0;
      for (const row of rows) {
        const id = String(row?.id || row?.code || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        added++;
        detailed++;
        try {
          const job = parseKuaishouJob(source, row, now);
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
        if (seen.size >= jobLimit) break;
      }
      if (!rows.length || added === 0 || rows.length < size) { snapshotComplete = rows.length < size; break; }
    }
  } catch { errors++; }

  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) errors++;
  if (emptyResult) snapshotComplete = false;

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, snapshotComplete, emptyResult } };
}
