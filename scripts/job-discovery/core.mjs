import crypto from 'node:crypto';

export const CITY_NAMES = ['深圳','上海','广州','北京','武汉','杭州','成都','南京','苏州','西安','长沙','东莞','天津','重庆','厦门','珠海','佛山','惠州','香港'];
const ROLE_RULES = [
  ['GTM', /\bGTM\b|go[- ]?to[- ]?market|上市推广|新品上市/i],
  ['产品运营', /产品运营|产品策划|产品增长/i],
  ['产品营销', /产品营销|营销策划|品牌策划|品牌经理|品牌管理|品牌运营|市场推广|市场专员|数字营销|品牌营销/i],
  ['海外运营', /海外.*运营|国际.*运营|全球.*运营|版本运营|本地化运营|海外推广运营/i],
  ['电商运营', /电商运营|电商实习|跨境电商|商家运营|平台运营|店铺运营/i],
  ['用户运营', /用户运营|会员运营|用户增长|社区运营/i],
  ['业务运营', /业务运营|运营管理|经营管理|销售运营|商务运营|战略运营|部门运营|服务运营/i],
  ['内容运营', /内容运营|社媒运营|KOL运营|SEO运营|新媒体|内容策划/i],
  ['项目管理', /项目管理|项目经理|PMO|项目运营|项目推进|项目协调/i],
  ['HR', /人力资源|招聘运营|校园招聘|HRBP|\bHR\b/i],
  ['市场', /市场专员|市场营销|市场推广|市场分析|品牌市场/i],
  ['销售', /销售代表|销售经理|客户经理|渠道销售|商务拓展|\bBD\b/i]
];

const SKILL_WORDS = ['英语','Excel','数据分析','内容运营','市场分析','PPT','SQL','PowerBI','GA4','SEO','项目管理','跨部门沟通','文案','电商'];
const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'];
const ADJACENT_TITLE = /技术文档|本地化|翻译|国际商务|海外商务|客户成功|品牌|市场|运营|GTM|电商|项目管理|项目经理|项目运营|招聘|人力资源|内容/i;

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

function extractLocation(posting, pageText, title = '') {
  const titleCandidate = CITY_NAMES.find((city) => String(title).includes(city));
  if (titleCandidate) return titleCandidate;

  const raw = posting?.jobLocation;
  const locations = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const fromLd = locations.flatMap((loc) => {
    const addr = loc?.address || loc;
    return [addr?.addressLocality, addr?.addressRegion, addr?.name].map(asText).filter(Boolean);
  }).join('、');
  const candidate = CITY_NAMES.find((city) => fromLd.includes(city));
  if (candidate) return candidate;
  return CITY_NAMES.find((city) => pageText.slice(0, 1400).includes(city)) || fromLd || '待核';
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

export function classifyRole(title = '') {
  const hit = ROLE_RULES.filter(([, rx]) => rx.test(title)).map(([name]) => name);
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

// 薪资提取：从职位描述/要求文本中提取薪资原始字符串，供 compensation.js 后续解析。
// 兼容校招 JD 常见的 15-25K、15K-25K、14-18万元/年、年薪30万等写法。
const SALARY_RANGE_SEP = String.raw`(?:-|~|～|—|–|至|到)`;
const ANNUAL_SALARY_CONTEXT = String.raw`(?:年薪|年收入|年度总包|年度薪酬|年包|年薪资|总包|package|total\s*compensation)`;
const MONTHLY_SALARY_CONTEXT = String.raw`(?:月薪|薪资范围|薪资待遇|薪酬范围|薪酬|薪资|工资|待遇|税前|税后|base\s*salary)`;

function plausibleWan(min, max = min) {
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0 && min <= max && max <= 1000;
}

export function extractSalary(text = '') {
  const raw = String(text || '').replace(/\s+/g, ' ');
  if (!raw) return '';
  if (/薪资面议|薪酬面议|工资面议|待遇面议|面议薪资|^\s*面议\s*$/.test(raw)) return '';

  // 1. 年薪区间：支持“年薪20-35万”“年度总包20万-35万”“14-18万元/年”“9W-11W元/年”。
  const annualRangePatterns = [
    new RegExp(`${ANNUAL_SALARY_CONTEXT}[^\\d]{0,16}(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)?\\s*${SALARY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)(?:\\s*元)?(?:\\s*(?:/|每)\\s*年)?`, 'i'),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)?\\s*${SALARY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)(?:\\s*元)?\\s*(?:/|每)\\s*年`, 'i')
  ];
  for (const rx of annualRangePatterns) {
    const m = raw.match(rx);
    if (!m) continue;
    const min = Number(m[1]);
    const max = Number(m[2]);
    if (plausibleWan(min, max)) return m[0].trim();
  }

  // 2. 单值年薪：例如“年薪30万”。
  const annualSingleRx = new RegExp(`${ANNUAL_SALARY_CONTEXT}[^\\d]{0,16}(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)(?:\\s*元)?(?:\\s*(?:/|每)\\s*年)?`, 'i');
  const annualSingleM = raw.match(annualSingleRx);
  if (annualSingleM && plausibleWan(Number(annualSingleM[1]))) return annualSingleM[0].trim();

  // 3. 月薪K区间：首个 K 可省略，兼容 15-25K 与 15K-25K；可带 14薪。
  const monthlyKRx = new RegExp(
    `(?:${MONTHLY_SALARY_CONTEXT}[^\\d]{0,10})?(\\d+(?:\\.\\d+)?)\\s*(?:k|K|千)?\\s*${SALARY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:k|K|千)(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?`,
    'i'
  );
  const monthlyKM = raw.match(monthlyKRx);
  if (monthlyKM) {
    const min = Number(monthlyKM[1]);
    const max = Number(monthlyKM[2]);
    if (min >= 3 && max <= 500 && min <= max) return monthlyKM[0].trim();
  }

  // 4. 月薪元：月薪/薪资范围 + 数字-数字 + 元/月。
  const monthlyYuanRx = new RegExp(
    `(?:月薪|薪资范围|薪资待遇|薪酬范围|薪酬|薪资|工资|待遇|税前|税后)[^\\d]{0,10}(\\d{4,6})\\s*${SALARY_RANGE_SEP}\\s*(\\d{4,6})\\s*(?:元)?\\s*(?:/|每)?\\s*(?:月|个月)?(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?`,
    'i'
  );
  const monthlyYuanM = raw.match(monthlyYuanRx);
  if (monthlyYuanM) {
    const min = Number(monthlyYuanM[1]);
    const max = Number(monthlyYuanM[2]);
    if (min >= 1000 && max <= 200000 && min <= max) return monthlyYuanM[0].trim();
  }

  // 5. 单值月薪K：必须带薪资上下文，避免把普通技术参数误识别为薪资。
  const singleKRx = new RegExp(`${MONTHLY_SALARY_CONTEXT}[^\\d]{0,10}(\\d+(?:\\.\\d+)?)\\s*(?:k|K|千)(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?`, 'i');
  const singleKM = raw.match(singleKRx);
  if (singleKM) {
    const value = Number(singleKM[1]);
    if (value >= 3 && value <= 500) return singleKM[0].trim();
  }

  // 6. “薪资20万-35万”一类写法，按年包语义保留原文。
  const wanCtxRx = new RegExp(
    `(?:薪资|薪酬|工资|待遇|收入|总包|package)[^\\d]{0,12}(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)\\s*${SALARY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)`,
    'i'
  );
  const wanCtxM = raw.match(wanCtxRx);
  if (wanCtxM && plausibleWan(Number(wanCtxM[1]), Number(wanCtxM[2]))) return wanCtxM[0].trim();

  return '';
}

// 专业限制检测：排除有明确理工科/技术/特定专业门槛的岗位（文科/商科/语言类不可投）
const MAJOR_RESTRICTION_RX = /(理工科|工科|理科|理工学|计算机|软件|电子|通信|机械|自动化|电气|微电子|集成电路|物理|化学|生物|数学|统计|医学|药学|临床|法学|法律|建筑|土木|城乡规划|材料|能源|动力|环境|水利|地质|海洋|天文).{0,10}(相关)?(专业|专业背景|专业基础)/;
const MAJOR_FRIENDLY_RX = /(专业不限|不限专业|文科.*专业|商科.*专业|语言类.*专业|英语.*专业|管理类.*专业|人文社科.*专业|经济类.*专业|金融类.*专业|市场营销.*专业|新闻传播.*专业)/;

export function hasMajorRestriction(job = {}) {
  const text = [job._searchText, job.requirement, job.description, job.title].filter(Boolean).join(' ');
  if (MAJOR_FRIENDLY_RX.test(text)) return false;
  return MAJOR_RESTRICTION_RX.test(text);
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
  const pageText = htmlToText(html);
  const posting = findJobPosting(html);
  const fallback = fallbackTitleAndCompany(html, pageText);
  const title = asText(posting?.title) || fallback.title;
  const company = asText(posting?.hiringOrganization) || fallback.company;
  const rawDescription = htmlToText(asText(posting?.description) || '') || (() => {
    const idx = pageText.indexOf('岗位职责');
    return (idx >= 0 ? pageText.slice(idx, idx + 2600) : pageText.slice(0, 2600)).trim();
  })();
  const jobText = `${title}\n${company}\n${rawDescription}`;
  const cohortEvidence = `${title}\n${rawDescription}\n${pageText}`;
  const deadline = normalizeDate(posting?.validThrough) || fallbackDeadline(pageText);
  const graduationYear = is2027(cohortEvidence, posting) ? '2027' : '';
  const roleFamily = classifyRole(title);
  const skills = detectSkills(jobText);
  const experienceKeywords = EXPERIENCE_WORDS.filter((word) => jobText.includes(word)).slice(0, 8);
  const languages = /英语|英文|CET|雅思|托福|English/i.test(jobText) ? ['英语'] : [];
  const preferenceTags = [
    /海外|国际|全球/.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场/.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);
  const publishedAt = normalizeDate(posting?.datePosted) || normalizeDate(lastmod);
  const salary = asText(posting?.baseSalary) || extractSalary(jobText);
  const id = `nowcoder-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  const description = `自动发现的 ${roleFamily.join(' / ')} 类岗位${skills.length ? `；识别关键词：${skills.slice(0,5).join('、')}` : ''}。完整职责与要求请打开来源页面，并在投递前回公司校招官网核验。`;
  return {
    id, company, title, roleFamily, city: extractLocation(posting, pageText, title), graduationYear,
    skills, languages, experienceKeywords, preferenceTags, riskTags,
    source: '牛客公开职位', sourceType: 'secondary', sourceUrl: url,
    verification: '二手来源，待官网核验', publishedAt, deadline,
    description, salary, status: '推荐', discoveredAt: now.toISOString(),
    closed: isClosed(pageText, deadline, now),
    jobDescription: rawDescription,
    jobRequirements: '',
    _searchText: jobText
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

function hasRoleSignal(job, profile) {
  const title = String(job.title || '');
  const directKeyword = (profile.roleKeywords || []).some((kw) => title.toLowerCase().includes(String(kw).toLowerCase()));
  const classified = (job.roleFamily || []).some((role) => role !== '其他');
  return directKeyword || classified || ADJACENT_TITLE.test(title);
}

export function shouldKeep(job, profile, now = new Date()) {
  if (!job || job.graduationYear !== String(profile.graduationYear || '2027')) return false;
  if (job.closed || isClosed('', job.deadline, now)) return false;
  if (!hasRoleSignal(job, profile)) return false;
  if (hasMajorRestriction(job)) return false;
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
