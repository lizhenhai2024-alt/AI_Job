import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, is2027 } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘','商务','物流'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['德语', /德语|German/i], ['法语', /法语|French/i],
  ['西班牙语', /西语|西班牙语|Spanish/i], ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i],
  ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i], ['俄语', /俄语|Russian/i], ['阿拉伯语', /阿语|阿拉伯语|Arabic/i]
];
const SAFE_PATH_RX = /^[A-Za-z0-9_/-]{1,80}$/;
const FALLBACK_PATHS = ['campus', 'index', 'fte', 'recruitment', 'experienced', 'social'];

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function baseOf(source = {}) {
  return String(source.baseUrl || source.url || '').replace(/\/$/, '');
}

function cityFrom(row = {}) {
  const names = Array.isArray(row.city_list) ? row.city_list.map((x) => clean(x?.name)).filter(Boolean) : [];
  const raw = names.join('、');
  const title = clean(row.title || '');
  return CITY_NAMES.find((city) => title.includes(city)) || CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

function languagesFrom(text = '') {
  return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([name]) => name);
}

function publishedAt(row = {}) {
  const ts = Number(row.publish_time || 0);
  if (!ts) return '';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function directUrl(source, path, id) {
  const base = baseOf(source);
  if (!id) return source.url || base;
  return `${base}/${String(path || '').replace(/^\/+|\/+$/g, '')}/position/${encodeURIComponent(id)}/detail`;
}

function portalHeaders(source, path) {
  const base = baseOf(source);
  return {
    'website-path': path,
    'portal-channel': 'office',
    'portal-platform': 'pc',
    origin: base,
    referer: `${base}/`,
    'content-type': 'application/json',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.7; +https://github.com/lizhenhai2024-alt/AI_Job)'
  };
}

function apiBody(source, keyword, limit, offset) {
  return {
    keyword,
    limit,
    offset,
    portal_type: Number(source.portalType || 2),
    job_category_id_list: [],
    location_code_list: [],
    subject_id_list: [],
    recruitment_id_list: [],
    job_function_id_list: []
  };
}

async function callJobsApi(fetcher, source, path, { keyword = '', limit = 20, offset = 0 } = {}) {
  const base = baseOf(source);
  const response = await fetcher(`${base}/api/v1/search/job/posts`, {
    method: 'POST',
    headers: portalHeaders(source, path),
    body: JSON.stringify(apiBody(source, keyword, limit, offset))
  });
  if (!response.ok) throw new Error(`Feishu API HTTP ${response.status} for ${source.company}`);
  const payload = await response.json();
  if (payload?.code != null && Number(payload.code) !== 0) throw new Error(payload?.message || `Feishu API code ${payload.code} for ${source.company}`);
  const posts = payload?.data?.job_post_list;
  if (!Array.isArray(posts)) throw new Error(`Feishu API payload missing data.job_post_list for ${source.company}`);
  return { posts, count: Number(payload?.data?.count || 0) };
}

export function parseWebsitePath(html = '') {
  const script = String(html).match(/<script[^>]+id=["']js-websiteInfo["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return '';
  try {
    const payload = JSON.parse(script[1].trim());
    const path = String(payload?.website_info?.path || '').replace(/^\/+|\/+$/g, '');
    return SAFE_PATH_RX.test(path) ? path : '';
  } catch {
    return '';
  }
}

async function homepagePath(fetcher, source) {
  try {
    const response = await fetcher(`${baseOf(source)}/`, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.7; +https://github.com/lizhenhai2024-alt/AI_Job)'
      }
    });
    if (!response.ok) return '';
    return parseWebsitePath(await response.text());
  } catch {
    return '';
  }
}

export async function resolveWebsitePath(fetcher, source) {
  const explicit = String(source.websitePath || '').replace(/^\/+|\/+$/g, '');
  const detected = await homepagePath(fetcher, source);
  const candidates = [...new Set([explicit, detected, ...FALLBACK_PATHS].filter((path) => SAFE_PATH_RX.test(path)))];
  let lastError = null;
  for (const path of candidates) {
    try {
      await callJobsApi(fetcher, source, path, { limit: 1, offset: 0 });
      return path;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to resolve Feishu website-path for ${source.company}`);
}

function cohortEvidence(source, jobText) {
  if (is2027(jobText)) return { year: '2027', source: 'JD' };
  if (source.cohortMode === 'verified-2027-portal' && String(source.graduationYear) === '2027') {
    return { year: '2027', source: 'verified-portal' };
  }
  return { year: '', source: '' };
}

export function parseFeishuJob(source, row = {}, path = '', now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.title || '');
  const descriptionText = clean(row.description || '');
  const requirementText = clean(row.requirement || '');
  const category = clean(row?.job_function?.name || row?.job_category?.name || '');
  const recruitType = clean(row?.recruit_type?.name || '');
  const subject = clean(row?.subject?.name || row?.job_subject?.name || row?.recruitment?.name || '');
  const jobText = [title, category, recruitType, subject, descriptionText, requirementText].filter(Boolean).join('\n');
  const cohort = cohortEvidence(source, jobText);
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const sourceHash = crypto.createHash('sha1').update(baseOf(source)).digest('hex').slice(0, 6);
  const fallbackId = crypto.createHash('sha1').update(`${title}|${cityFrom(row)}`).digest('hex').slice(0, 12);
  return {
    id: `feishu-${sourceHash}-${rawId || fallbackId}`,
    company: source.company,
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: cohort.year,
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((word) => jobText.toLowerCase().includes(word.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: `${source.company}官方飞书招聘`,
    sourceType: 'official',
    sourceUrl: directUrl(source, path, rawId),
    verification: cohort.source === 'verified-portal' ? '官方招聘官网/API；2027届门户已核验' : '官方招聘官网/API',
    publishedAt: publishedAt(row),
    deadline: '',
    description: `${source.company}官方校园招聘岗位；${category ? `职类：${category}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText,
    _recruitType: recruitType,
    _subject: subject
  };
}

function isInternRecruitType(value = '') {
  return /实习|intern(?:ship)?/i.test(String(value));
}

async function searchOne(profile, source, { fetcher = fetch, now = new Date() } = {}) {
  const pageSize = Math.max(1, Math.min(Number(source.pageSize || 30), 50));
  const maxPages = Math.max(1, Math.min(Number(source.maxPages || 30), 100));
  const maxJobs = Math.max(1, Math.min(Number(source.maxJobs || 500), 1000));
  let pages = 0, listed = 0, errors = 0, snapshotComplete = false, path = '';
  const jobs = [];
  const seen = new Set();
  try {
    path = await resolveWebsitePath(fetcher, source);
    for (let page = 0, offset = 0; page < maxPages && seen.size < maxJobs; page++) {
      const { posts, count } = await callJobsApi(fetcher, source, path, { limit: pageSize, offset });
      pages++;
      listed += posts.length;
      for (const row of posts) {
        const id = String(row?.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const job = parseFeishuJob(source, row, path, now);
        if (!job.title || !job.graduationYear || isInternRecruitType(job._recruitType) || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
        if (seen.size >= maxJobs) break;
      }
      if (!posts.length || posts.length < pageSize || (count > 0 && seen.size >= count)) {
        snapshotComplete = true;
        break;
      }
      offset += posts.length;
    }
  } catch {
    errors++;
  }
  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) errors++;
  if (emptyResult) snapshotComplete = false;
  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, keptJobs: kept.length, errors, snapshotComplete, emptyResult, websitePath: path } };
}

export async function searchFeishuJobs(profile, sources = [], options = {}) {
  const jobs = [];
  const perPortal = {};
  let scannedPortals = 0, listed = 0, errors = 0;
  for (const source of sources) {
    const result = await searchOne(profile, source, options);
    perPortal[source.company] = result.stats;
    listed += result.stats.listed;
    errors += result.stats.errors;
    if (result.stats.listed > 0) scannedPortals++;
    jobs.push(...result.jobs);
  }
  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: { portals: sources.length, scannedPortals, listed, keptJobs: kept.length, errors, perPortal }
  };
}
