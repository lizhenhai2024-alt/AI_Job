import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, is2027, extractSalary } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘','商务','物流'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['德语', /德语|German/i], ['法语', /法语|French/i],
  ['西班牙语', /西语|西班牙语|Spanish/i], ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i],
  ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i], ['俄语', /俄语|Russian/i], ['阿拉伯语', /阿语|阿拉伯语|Arabic/i]
];
const SAFE_PATH_RX = /^[A-Za-z0-9_/-]{1,80}$/;
const MACOS_CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHORT_2027_RX = /(?:^|[^0-9])27\s*届(?:毕业生|校招|秋招|应届)?/i;

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function localizedName(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return clean(value);
  if (typeof value === 'object') {
    return clean(value.zh_cn || value.i18n || value.en_us || value.name || value.value || '');
  }
  return clean(value);
}

function baseOf(source = {}) {
  return String(source.baseUrl || source.url || '').replace(/\/$/, '');
}

function websitePathOf(source = {}) {
  const path = String(source.websitePath || '').replace(/^\/+|\/+$/g, '');
  return SAFE_PATH_RX.test(path) ? path : '';
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

function directUrl(source, id) {
  const base = baseOf(source);
  if (!id) return source.url || base;
  if (source.detailTemplate) return String(source.detailTemplate).replace('{id}', encodeURIComponent(id));
  const path = websitePathOf(source) || 'index';
  return `${base}/${path}/position/${encodeURIComponent(id)}/detail`;
}

function apiHeaders(source) {
  const base = baseOf(source);
  const path = websitePathOf(source);
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'user-agent': MACOS_CHROME_UA,
    referer: path ? `${base}/${path}/` : `${base}/`
  };
  if (path) headers['website-path'] = path;
  return headers;
}

function apiBody(keyword, limit, offset) {
  const body = { limit, offset };
  if (keyword) body.keyword = keyword;
  return body;
}

async function callJobsApi(fetcher, source, { keyword = '', limit = 100, offset = 0 } = {}) {
  const base = baseOf(source);
  const response = await fetcher(`${base}/api/v1/search/job/posts`, {
    method: 'POST',
    headers: apiHeaders(source),
    body: JSON.stringify(apiBody(keyword, limit, offset)),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`Feishu API HTTP ${response.status} for ${source.company}`);
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Feishu API non-JSON response for ${source.company}`); }
  if (Number(payload?.code) !== 0) throw new Error(`Feishu API code ${payload?.code ?? 'missing'} for ${source.company}: ${payload?.message || ''}`.trim());
  const posts = payload?.data?.job_post_list;
  if (!Array.isArray(posts)) throw new Error(`Feishu API payload missing data.job_post_list for ${source.company}`);
  return { posts, count: Number(payload?.data?.count || 0) };
}

// Kept for compatibility and diagnostics. For generic multi-board tenants the verified
// campus website-path is stored in config and sent only as the website-path header.
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

function cohortEvidence(jobText) {
  return is2027(jobText) || SHORT_2027_RX.test(jobText)
    ? { year: '2027', source: 'JD' }
    : { year: '', source: '' };
}

export function parseFeishuJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.title || '');
  const descriptionText = clean(row.description || '');
  const requirementText = clean(row.requirement || '');
  const category = localizedName(row?.job_function?.name || row?.job_category?.name || '');
  const recruitType = localizedName(row?.recruit_type?.name || '');
  const recruitGroup = localizedName(row?.recruit_type?.parent?.name || '');
  const subject = localizedName(row?.subject?.name || row?.job_subject?.name || row?.recruitment?.name || '');
  const jobText = [title, category, recruitType, recruitGroup, subject, descriptionText, requirementText].filter(Boolean).join('\n');
  const cohort = cohortEvidence(jobText);
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
    sourceUrl: directUrl(source, rawId),
    verification: cohort.year ? '官方招聘官网/API；岗位文本明确2027届' : '官方招聘官网/API；届别待核',
    publishedAt: publishedAt(row),
    deadline: '',
    description: `${source.company}官方校园招聘岗位；${category ? `职类：${category}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: extractSalary(jobText),
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: descriptionText,
    jobRequirements: requirementText,
    _searchText: jobText,
    _recruitType: recruitType,
    _recruitGroup: recruitGroup,
    _subject: subject
  };
}

function isInternRecruitType(value = '') {
  return /实习|intern(?:ship)?/i.test(String(value));
}

function isSocialRecruitType(value = '') {
  return /社会招聘|社招|experienced/i.test(String(value));
}

async function searchOne(profile, source, { fetcher = fetch, now = new Date() } = {}) {
  const pageSize = Math.max(1, Math.min(Number(source.pageSize || 100), 100));
  const maxPages = Math.max(1, Math.min(Number(source.maxPages || 30), 200));
  const maxJobs = Math.max(1, Math.min(Number(source.maxJobs || 1000), 5000));
  let pages = 0, listed = 0, errors = 0, snapshotComplete = false, lastError = '';
  let cohortMatched = 0, missingCohort = 0, internRejected = 0, socialRejected = 0, pureSalesRejected = 0, relevanceRejected = 0;
  const jobs = [];
  const seen = new Set();
  const cohortSamples = [];
  try {
    for (let page = 0, offset = 0; page < maxPages && seen.size < maxJobs; page++) {
      const { posts, count } = await callJobsApi(fetcher, source, { limit: pageSize, offset });
      pages++;
      listed += posts.length;
      for (const row of posts) {
        const id = String(row?.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const job = parseFeishuJob(source, row, now);
        if (!job.title) continue;
        if (!job.graduationYear) { missingCohort++; continue; }
        cohortMatched++;
        if (cohortSamples.length < 5) cohortSamples.push(job.title);
        if (isInternRecruitType(job._recruitType)) { internRejected++; continue; }
        if (isSocialRecruitType(job._recruitType) || isSocialRecruitType(job._recruitGroup)) { socialRejected++; continue; }
        if (job.riskTags?.includes('纯销售')) { pureSalesRejected++; continue; }
        if (shouldKeep(job, profile, now)) jobs.push(job);
        else relevanceRejected++;
        if (seen.size >= maxJobs) break;
      }
      if (!posts.length || posts.length < pageSize || (count > 0 && seen.size >= count)) {
        snapshotComplete = true;
        break;
      }
      offset += posts.length;
    }
  } catch (error) {
    errors++;
    lastError = String(error?.message || error);
  }
  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) {
    errors++;
    lastError = 'Feishu source returned zero jobs';
  }
  if (emptyResult) snapshotComplete = false;
  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: {
      pages, listed, keptJobs: kept.length, errors, snapshotComplete, emptyResult, error: lastError,
      websitePath: websitePathOf(source), cohortMatched, missingCohort, internRejected, socialRejected,
      pureSalesRejected, relevanceRejected, cohortSamples
    }
  };
}

export async function searchFeishuJobs(profile, sources = [], options = {}) {
  const jobs = [];
  const perPortal = {};
  let scannedPortals = 0, listed = 0, errors = 0, cohortMatched = 0;
  for (const source of sources) {
    const result = await searchOne(profile, source, options);
    perPortal[source.company] = result.stats;
    listed += result.stats.listed;
    errors += result.stats.errors;
    cohortMatched += result.stats.cohortMatched;
    if (result.stats.listed > 0) scannedPortals++;
    jobs.push(...result.jobs);
  }
  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: { portals: sources.length, scannedPortals, listed, cohortMatched, keptJobs: kept.length, errors, perPortal }
  };
}
