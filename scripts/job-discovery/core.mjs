import crypto from 'node:crypto';

export const CITY_NAMES = ['深圳','上海','广州','北京','武汉','杭州','成都','南京','苏州','西安','长沙','东莞','天津','重庆','厦门','珠海','佛山','惠州','香港'];
const ROLE_RULES = [
  ['GTM', /\bGTM\b|go[- ]?to[- ]?market|上市推广|新品上市/i],
  ['产品营销', /产品营销|营销策划|品牌策划|市场推广|市场专员|数字营销|品牌营销/i],
  ['海外运营', /海外.*运营|国际.*运营|全球.*运营|版本运营|本地化运营/i],
  ['电商运营', /电商运营|跨境电商|平台运营|商家运营/i],
  ['用户运营', /用户运营|会员运营|用户增长|社区运营/i],
  ['业务运营', /业务运营|运营管理|经营管理|销售运营|商务运营/i],
  ['内容运营', /内容运营|SEO运营|新媒体|内容策划/i],
  ['项目管理', /项目管理|项目运营|项目推进|项目协调/i],
  ['HR', /人力资源|招聘运营|校园招聘|HR|人才/i],
  ['市场', /市场专员|市场营销|市场推广|市场分析/i],
  ['销售', /销售|客户经理|渠道|商务拓展|BD/i]
];

const SKILL_WORDS = ['英语','Excel','数据分析','内容运营','市场分析','PPT','SQL','PowerBI','GA4','SEO','项目管理','跨部门沟通','文案','电商'];
const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'];

export function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html = '') {
  return decodeHtml(String(html))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function parseJsonLd(html = '') {
  const blocks = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out = [];
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(decodeHtml(raw.trim()));
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) if (item && typeof item === 'object') out.push(item);
    } catch {}
  }
  return out;
}

export function findJobPosting(html = '') {
  return parseJsonLd(html).find((item) => {
    const type = item?.['@type'];
    return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
  }) || null;
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('、');
  if (typeof value === 'object') return value.name || value.value || value.addressLocality || '';
  return String(value);
}

function extractLocation(posting, text) {
  const raw = posting?.jobLocation;
  const locations = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const fromLd = locations.flatMap((loc) => {
    const addr = loc?.address || loc;
    return [addr?.addressLocality, addr?.addressRegion, addr?.name].map(asText).filter(Boolean);
  }).join('、');
  const candidate = CITY_NAMES.find((city) => fromLd.includes(city));
  if (candidate) return candidate;
  return CITY_NAMES.find((city) => text.slice(0, 1400).includes(city)) || fromLd || '待核';
}

function normalizeDate(value = '') {
  if (!value) return '';
  const m = String(value).match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}

function fallbackDeadline(text) {
  const m = text.match(/投递时间[:：]?\s*(20\d{2}年\d{1,2}月\d{1,2}日)\s*[-—至到]\s*(20\d{2}年\d{1,2}月\d{1,2}日)/);
  return m ? normalizeDate(m[2]) : '';
}

function fallbackTitleAndCompany(html, text) {
  const titleTag = decodeHtml((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1]).replace(/\s+/g,' ').trim();
  let jobTitle = '';
  let company = '';
  const m = titleTag.match(/^(.+?)_(.+?)(?:校招|实习)_牛客网/i);
  if (m) { jobTitle = m[1].trim(); company = m[2].trim(); }
  if (!jobTitle) {
    const h1 = decodeHtml((String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1]).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    jobTitle = h1 || text.split('\n')[0] || '待核岗位';
  }
  return { title: jobTitle, company: company || '待核公司' };
}

export function classifyRole(text = '') {
  const hit = ROLE_RULES.filter(([, rx]) => rx.test(text)).map(([name]) => name);
  return hit.length ? [...new Set(hit)].slice(0, 4) : ['其他'];
}

export function detectSkills(text = '') {
  const found = SKILL_WORDS.filter((word) => text.toLowerCase().includes(word.toLowerCase()));
  if (/CET[-‑ ]?6|六级|英语.*工作语言|英文.*工作语言/i.test(text)) found.unshift('英语');
  return [...new Set(found)].slice(0, 8);
}

export function detectRisks(text = '') {
  const risks = [];
  if (/纯销售|销售经理|渠道销售|区域代表|大客户销售/.test(text)) risks.push('纯销售');
  if (/长期驻外|海外外派|驻外.*年|外派.*年/.test(text)) risks.push('长期驻外');
  if (/海外出差|出差.*个月|每年.*个月.*海外/.test(text)) risks.push('海外出差');
  if (/高强度|抗压|节奏快/.test(text)) risks.push('节奏快');
  return [...new Set(risks)];
}

export function is2027(text = '', posting = null) {
  const hay = `${text} ${JSON.stringify(posting || {})}`;
  return /2027届|2027\s*届|2026年\s*9月[^。\n]{0,40}2027年\s*8月|2026[-\/.]0?9[^\n]{0,40}2027[-\/.]0?8/.test(hay);
}

export function isClosed(text = '', deadline = '', now = new Date()) {
  if (/收藏\s*已结束|已结束|停止招聘|职位已关闭/.test(text)) return true;
  if (deadline) {
    const d = new Date(`${deadline}T23:59:59+08:00`);
    if (!Number.isNaN(d.getTime()) && d < now) return true;
  }
  return false;
}

export function parseJobPage({ html, url, lastmod = '', now = new Date() }) {
  const text = htmlToText(html);
  const posting = findJobPosting(html);
  const fallback = fallbackTitleAndCompany(html, text);
  const title = asText(posting?.title) || fallback.title;
  const company = asText(posting?.hiringOrganization) || fallback.company;
  const rawDescription = htmlToText(asText(posting?.description) || '') || (() => {
    const idx = text.indexOf('岗位职责');
    return (idx >= 0 ? text.slice(idx, idx + 2600) : text.slice(0, 2600)).trim();
  })();
  const combined = `${title}\n${company}\n${rawDescription}\n${text}`;
  const deadline = normalizeDate(posting?.validThrough) || fallbackDeadline(text);
  const graduationYear = is2027(combined, posting) ? '2027' : '';
  const roleFamily = classifyRole(`${title}\n${rawDescription}`);
  const skills = detectSkills(combined);
  const experienceKeywords = EXPERIENCE_WORDS.filter((word) => combined.includes(word)).slice(0, 8);
  const languages = /英语|英文|CET|雅思|托福|English/i.test(combined) ? ['英语'] : [];
  const preferenceTags = [
    /海外|国际|全球/.test(combined) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场/.test(combined) ? '跨文化' : '',
    /出海|海外市场|跨境/.test(combined) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(combined);
  const publishedAt = normalizeDate(posting?.datePosted) || normalizeDate(lastmod);
  const salary = asText(posting?.baseSalary);
  const id = `nowcoder-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  const description = `自动发现的 ${roleFamily.join(' / ')} 类岗位${skills.length ? `；识别关键词：${skills.slice(0,5).join('、')}` : ''}。完整职责与要求请打开来源页面，并在投递前回公司校招官网核验。`;
  return {
    id, company, title, roleFamily, city: extractLocation(posting, text), graduationYear,
    skills, languages, experienceKeywords, preferenceTags, riskTags,
    source: '牛客公开职位', sourceType: 'secondary', sourceUrl: url,
    verification: '二手来源，待官网核验', publishedAt, deadline,
    description, salary, status: '推荐', discoveredAt: now.toISOString(),
    closed: isClosed(text, deadline, now), _searchText: combined
  };
}

export function relevanceScore(job, profile) {
  const text = [job.title, job.company, job.city, ...(job.roleFamily || []), ...(job.skills || []), job._searchText || job.description].join(' ').toLowerCase();
  let score = 0;
  for (const kw of profile.roleKeywords || []) if (text.includes(String(kw).toLowerCase())) score += 4;
  for (const kw of profile.keywords || []) if (text.includes(String(kw).toLowerCase())) score += 2;
  for (const city of profile.targetCities || []) if (String(job.city).includes(city)) score += 2;
  for (const ex of profile.strongExclude || []) if (String(job.title).includes(ex)) score -= 20;
  return score;
}

export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  return relevanceScore(job, profile) >= Number(profile.minRelevanceScore ?? 4);
}

export function dedupeJobs(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    const key = `${String(job.company).trim().toLowerCase()}|${String(job.title).trim().toLowerCase()}|${String(job.city).trim().toLowerCase()}`;
    const prev = map.get(key);
    if (!prev || String(job.publishedAt || '') > String(prev.publishedAt || '')) map.set(key, job);
  }
  return [...map.values()];
}

export function companiesFromJobs(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    const key = job.company || '待核公司';
    const item = map.get(key) || { company: key, jobCount: 0, cities: new Set(), roleFamilies: new Set(), latestPublishedAt: '', source: job.source, verification: job.verification };
    item.jobCount += 1;
    if (job.city) item.cities.add(job.city);
    for (const role of job.roleFamily || []) item.roleFamilies.add(role);
    if ((job.publishedAt || '') > item.latestPublishedAt) item.latestPublishedAt = job.publishedAt || '';
    map.set(key, item);
  }
  return [...map.values()].map((x) => ({ ...x, cities: [...x.cities], roleFamilies: [...x.roleFamilies] })).sort((a,b) => b.jobCount - a.jobCount || a.company.localeCompare(b.company, 'zh-CN'));
}
