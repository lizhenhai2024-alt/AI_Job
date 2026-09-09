import crypto from 'node:crypto';
import { fetchText } from './nowcoder.mjs';
import { CITY_NAMES, htmlToText, classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, is2027, isClosed } from './core.mjs';

const DEFAULT_MAX_LINKS = 36;
const RECRUIT_LINK_RX = /2027\s*届|27\s*届|校园招聘|校招|秋招|招聘简章|招聘公告|招聘信息|宣讲/i;
const SKIP_LINK_RX = /登录|注册|联系我们|政策|手续|下载|新闻|通知公告|邀请函|生源信息|双选会邀请|招聘活动邀请/i;
const NON_COMPANY_RX = /^(?:待核公司|就业办\d*|就业办|就业处|就业指导中心|就业创业中心|招生就业处|招生就业办|学生就业|学生工作处|人才服务中心|毕业生就业|关于做好|关于开展|关于组织|通知|公告|邀请函|感谢贵单位|尊敬的用人单位|各用人单位|各学院|各位同学|就业补贴|求职补贴|一次性求职补贴)$/i;
const NON_COMPANY_CONTAINS_RX = /(?:就业创业工作|毕业生一次性求职补贴|求职补贴申报|校园招聘正式启动$|秋季学期校园招聘正式启动$|工商查询$)/i;
const SCHOOL_ENTITY_RX = /(?:大学|学院|职业技术学校|职业学院|就业信息网|就业指导中心|就业创业中心)$/i;
const NOTICE_TITLE_RX = /(?:关于做好|关于开展|关于组织|求职补贴|就业补贴|招聘活动邀请函|双选会邀请函|校园招聘正式启动$|秋季学期校园招聘正式启动$)/i;

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;|&#160;/gi, ' ');
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function sameSite(url, bases = []) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return bases.some((base) => {
      try {
        const baseHost = new URL(base).hostname.toLowerCase();
        return host === baseHost || host.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${host}`);
      } catch { return false; }
    });
  } catch { return false; }
}

export function extractUniversityRecruitLinks(html = '', baseUrl = '', source = {}) {
  const out = [];
  const seen = new Set();
  const allowedBases = [baseUrl, ...(source.allowedBases || [])].filter(Boolean);
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url = '';
    try { url = new URL(decodeHtml(match[1]), baseUrl).href; } catch { continue; }
    if (!/^https?:\/\//i.test(url) || seen.has(url) || !sameSite(url, allowedBases)) continue;
    const text = stripTags(match[2]);
    if (!text || SKIP_LINK_RX.test(text)) continue;
    const explicitPattern = source.detailUrlPattern ? new RegExp(source.detailUrlPattern, 'i') : null;
    const matchesPattern = explicitPattern?.test(url) || false;
    if (!matchesPattern && !RECRUIT_LINK_RX.test(text)) continue;
    seen.add(url);
    out.push({ url, text });
  }
  return out.slice(0, Number(source.maxLinks || DEFAULT_MAX_LINKS));
}

function firstHeading(html = '') {
  for (const tag of ['h1', 'h2']) {
    const match = String(html).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    const value = stripTags(match?.[1] || '');
    if (value) return value;
  }
  const title = stripTags((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1]);
  return title.replace(/[-_|].*?(就业|招聘|大学).*$/i, '').trim();
}

function cleanCompanyCandidate(value = '') {
  return String(value)
    .replace(/\s*(?:工商查询|查看工商|企业查询|单位详情)\s*$/i, '')
    .replace(/^[【〖\[]+|[】〗\]]+$/g, '')
    .replace(/[：:·丨|\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlausibleUniversityCompany(company = '', source = {}) {
  const value = cleanCompanyCandidate(company);
  if (!value || value.length < 2 || value.length > 60) return false;
  if (NON_COMPANY_RX.test(value) || NON_COMPANY_CONTAINS_RX.test(value)) return false;
  if (/^[\d\W_]+$/u.test(value)) return false;
  if (source.school && value.replace(/\s+/g, '') === String(source.school).replace(/\s+/g, '')) return false;
  if (SCHOOL_ENTITY_RX.test(value) && !/(银行|公司|集团|科技|股份|有限|事务所|研究院|医院|出版社)/.test(value)) return false;
  if (/^(?:感谢|尊敬|关于|各位|各用人单位|各学院)/.test(value)) return false;
  return true;
}

function extractCompany(title = '', text = '', source = {}) {
  const explicit = String(text).match(/(?:宣讲单位|招聘单位|用人单位|单位名称|公司名称)[:：]\s*([^\n。；;]{2,60})/i)?.[1]?.trim();
  if (explicit) {
    const cleaned = cleanCompanyCandidate(explicit);
    if (isPlausibleUniversityCompany(cleaned, source)) return cleaned;
  }
  const bracket = cleanCompanyCandidate(String(text).match(/〖([^〗]{2,50})〗/)?.[1]?.trim() || '');
  if (bracket && !/就业|大学|中心/.test(bracket) && isPlausibleUniversityCompany(bracket, source)) return bracket;
  const prefix = cleanCompanyCandidate(String(title)
    .replace(/^[【〖\[]+|[】〗\]]+$/g, '')
    .split(/2027\s*届|27\s*届|2027年|校园招聘|秋季招聘|秋招|招聘简章|招聘公告|校招/i)[0]);
  return isPlausibleUniversityCompany(prefix, source) ? prefix : '待核公司';
}

export function isPlausibleUniversityJob(job = {}, source = {}) {
  const company = String(job.company || '').trim();
  const title = String(job.title || '').trim();
  if (!isPlausibleUniversityCompany(company, source)) return false;
  if (!title || title.length < 4 || title.length > 180) return false;
  if (NOTICE_TITLE_RX.test(title) && !/(有限公司|股份|集团|银行|科技|汽车|电子|通信|家居|控股|公司)/.test(company)) return false;
  if (/^(?:宣讲单位[:：])?(?:就业办|就业处|就业指导中心|就业创业中心)/i.test(title)) return false;
  return true;
}

function dateFromText(text = '') {
  const match = String(text).match(/(?:发布时间|发布日期|发布于|日期)[:：]?\s*(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/i)
    || String(text).match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
}

function deadlineFromText(text = '') {
  const patterns = [
    /(?:投递截止|报名截止|网申截止|截止时间|简历投递截止时间)[:：]?\s*(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/i,
    /(?:截止至|截止到|截止)[:：]?\s*(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/i
  ];
  for (const rx of patterns) {
    const m = String(text).match(rx);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  return '';
}

function cityFromText(text = '') {
  return CITY_NAMES.find((city) => String(text).includes(city)) || '待核';
}

function languageFromText(text = '') {
  return /英语|英文|CET[-‑ ]?[46]|雅思|托福|English/i.test(text) ? ['英语'] : [];
}

export function parseUniversityJobPage({ html, url, source, now = new Date() }) {
  const text = htmlToText(html);
  const heading = firstHeading(html) || '待核招聘信息';
  const cohortText = `${heading}\n${text}`;
  const roleFamily = classifyRole(cohortText);
  const skills = detectSkills(cohortText);
  const publishedAt = dateFromText(text);
  const deadline = deadlineFromText(text);
  const company = extractCompany(heading, text, source);
  const sourceName = `${source.school}就业信息网`;
  const id = `university-${crypto.createHash('sha1').update(`${source.school}|${url}`).digest('hex').slice(0, 14)}`;
  const description = `${source.school}就业信息网发现的招聘信息。该渠道用于岗位发现与交叉取证；正式投递前仍需回公司官方校招官网核验具体岗位、届别与要求。`;
  return {
    id,
    company,
    title: heading,
    roleFamily,
    city: cityFromText(cohortText),
    graduationYear: is2027(cohortText) ? '2027' : '',
    skills,
    languages: languageFromText(cohortText),
    experienceKeywords: [],
    preferenceTags: [],
    riskTags: detectRisks(cohortText),
    source: sourceName,
    sourceType: 'secondary',
    sourceChannel: 'university',
    sourceUrl: url,
    verification: '高校就业信息网官方发布 · 待公司官网复核',
    sourceEvidence: [
      { label: sourceName, url },
      ...(source.listUrls || []).slice(0, 1).map((listUrl) => ({ label: `${source.school}招聘列表`, url: listUrl }))
    ],
    universitySource: {
      school: source.school,
      segments: source.segments || [],
      priority: Number(source.priority || 0)
    },
    publishedAt,
    deadline,
    description,
    status: '推荐',
    discoveredAt: now.toISOString(),
    closed: isClosed(text, deadline, now),
    _searchText: cohortText
  };
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      try { out[current] = await mapper(items[current], current); }
      catch (error) { out[current] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(limit) || 1, items.length || 1)) }, worker));
  return out;
}

export async function searchUniversityJobs(profile, universityConfig = {}, {
  fetcher = fetchText,
  now = new Date(),
  concurrency = 4,
  maxSchools = universityConfig.maxActiveSchools || 12
} = {}) {
  const sources = (universityConfig.schools || [])
    .filter((source) => source?.enabled && Array.isArray(source.listUrls) && source.listUrls.length)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.school).localeCompare(String(b.school), 'zh-CN'))
    .slice(0, Math.max(1, Number(maxSchools) || 12));

  const perPortal = {};
  const allJobs = [];
  let errors = 0;
  let listed = 0;
  let detailed = 0;

  for (const source of sources) {
    const candidates = [];
    let portalErrors = 0;
    for (const listUrl of source.listUrls) {
      try {
        const html = await fetcher(listUrl);
        candidates.push(...extractUniversityRecruitLinks(html, listUrl, source));
      } catch {
        portalErrors += 1;
      }
    }
    const unique = [...new Map(candidates.map((item) => [item.url, item])).values()].slice(0, Number(source.maxLinks || DEFAULT_MAX_LINKS));
    listed += unique.length;
    const rows = await mapLimit(unique, concurrency, async (candidate) => {
      const html = await fetcher(candidate.url);
      const job = parseUniversityJobPage({ html, url: candidate.url, source, now });
      if (!isPlausibleUniversityJob(job, source)) return null;
      return shouldKeep(job, profile, now) ? job : null;
    });
    detailed += rows.length;
    const rowErrors = rows.filter((row) => row?.error).length;
    portalErrors += rowErrors;
    errors += portalErrors;
    const jobs = dedupeJobs(rows.filter((row) => row && !row.error));
    allJobs.push(...jobs);
    perPortal[source.school] = {
      company: source.school,
      listPages: source.listUrls.length,
      listed: unique.length,
      detailed: rows.length,
      keptJobs: jobs.length,
      errors: portalErrors,
      priority: Number(source.priority || 0),
      segments: source.segments || []
    };
  }

  const jobs = dedupeJobs(allJobs);
  return {
    jobs,
    stats: {
      portals: sources.length,
      scannedPortals: Object.keys(perPortal).length,
      listed,
      detailed,
      keptJobs: jobs.length,
      errors,
      perPortal
    }
  };
}
