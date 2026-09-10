import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, htmlToText, decodeHtml } from './core.mjs';

const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];
const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','招聘','公关','传播','财务','人力资源','研发'];

function clean(value = '') {
  return decodeHtml(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html = '') {
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

function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }

function cityFromText(text) {
  return CITY_NAMES.find((c) => text.includes(c)) || '全国';
}

/**
 * Parse Unilever-style 51job page: <div class="item"> sections with department descriptions and apply links
 */
function parseUnileverItems(html, source, now) {
  const jobs = [];
  // Each <div class="item"> contains a department block with an apply link
  const itemRegex = /<div class="item"[^>]*>([\s\S]*?)(?=<div class="item"|<\/div>\s*<\/div>\s*<\/div>)/g;
  const items = [...html.matchAll(itemRegex)];

  for (const [, itemHtml] of items) {
    // Extract department name from <p class="x2">关于XXX部：</p>
    const deptMatch = itemHtml.match(/<p class="x2">关于([^：:]+)[：:]<\/p>/);
    const dept = deptMatch ? clean(deptMatch[1]) : '';
    if (!dept) continue;

    // Extract all description text
    const descText = stripTags(itemHtml);

    // Extract apply link
    const applyMatch = itemHtml.match(/<a[^>]+href="(https:\/\/xyz\.51job\.com\/external\/apply\.aspx\?jobid=\d+[^"]*)"[^>]*>/);
    const applyUrl = applyMatch ? applyMatch[1] : '';
    const jobIdMatch = applyUrl.match(/jobid=(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : '';

    const title = `${dept}管培生`;
    const jobText = [title, descText].join('\n');
    const skills = detectSkills(jobText);
    const roleFamily = classifyRole(title);
    const preferenceTags = [
      /海外|国际|全球|global|国际化/.test(jobText) ? '国际业务' : '',
      /跨文化|本地化|多语种/.test(jobText) ? '跨文化' : '',
      /出海|跨境/.test(jobText) ? '出海' : ''
    ].filter(Boolean);

    jobs.push({
      id: `job51-${crypto.createHash('sha1').update(`${jobId}|${title}`).digest('hex').slice(0, 12)}`,
      company: source.company || '联合利华',
      title,
      roleFamily,
      city: cityFromText(jobText),
      graduationYear: String(source.graduationYear || '2027'),
      skills,
      languages: languagesFrom(jobText),
      experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
      preferenceTags,
      riskTags: detectRisks(jobText),
      source: `${source.company}官方2027校招官网`,
      sourceType: 'official',
      sourceUrl: applyUrl || source.url || '',
      verification: '官方校招官网（前程无忧托管）',
      publishedAt: '',
      deadline: '',
      description: `${source.company}2027届管理培训生项目 - ${dept}。${descText.slice(0, 300)}。投递前请打开官方校招页确认最新状态。`,
      salary: '',
      status: '推荐',
      discoveredAt: now.toISOString(),
      _searchText: jobText,
      _sourceJobId: jobId
    });
  }
  return jobs;
}

/**
 * Parse ELC-style 51job page: <div class="job-item"> with job-title, job-sub-title, job-desc, apply link
 */
function parseElcItems(html, source, now) {
  const jobs = [];
  const itemRegex = /<div class="job-item"[^>]*>([\s\S]*?)(?=<div class="job-item"|<\/div>\s*<div class="job-wrap")/g;
  const items = [...html.matchAll(itemRegex)];

  for (const [, itemHtml] of items) {
    const titleMatch = itemHtml.match(/<div class="job-title"[^>]*>([\s\S]*?)<\/div>/);
    const subTitleMatch = itemHtml.match(/<div class="job-sub-title"[^>]*>([\s\S]*?)<\/div>/);
    const descMatch = itemHtml.match(/<div class="job-desc"[^>]*>([\s\S]*?)<\/div>/);
    const applyMatch = itemHtml.match(/<a[^>]+class="job-btn"[^>]+href="(https:\/\/xyz\.51job\.com\/external\/apply\.aspx\?jobid=\d+[^"]*)"[^>]*>/);

    const title = clean(titleMatch ? titleMatch[1].replace(/<br\s*\/?\s*\/?>/gi, ' ') : '');
    const subTitle = clean(subTitleMatch ? subTitleMatch[1] : '');
    const descText = stripTags(descMatch ? descMatch[1] : '');
    const applyUrl = applyMatch ? applyMatch[1] : '';
    const jobIdMatch = applyUrl.match(/jobid=(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : '';

    if (!title) continue;
    const fullTitle = subTitle ? `${title}（${subTitle}）` : title;
    const jobText = [fullTitle, descText].join('\n');
    const skills = detectSkills(jobText);
    const roleFamily = classifyRole(fullTitle);
    const preferenceTags = [
      /海外|国际|全球|global|国际化/.test(jobText) ? '国际业务' : '',
      /跨文化|本地化|多语种/.test(jobText) ? '跨文化' : ''
    ].filter(Boolean);

    jobs.push({
      id: `job51-${crypto.createHash('sha1').update(`${jobId}|${fullTitle}`).digest('hex').slice(0, 12)}`,
      company: source.company || '雅诗兰黛',
      title: fullTitle,
      roleFamily,
      city: cityFromText(jobText),
      graduationYear: String(source.graduationYear || '2027'),
      skills,
      languages: languagesFrom(jobText),
      experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
      preferenceTags,
      riskTags: detectRisks(jobText),
      source: `${source.company}官方2027校招官网`,
      sourceType: 'official',
      sourceUrl: applyUrl || source.url || '',
      verification: '官方校招官网（前程无忧托管）',
      publishedAt: '',
      deadline: '',
      description: `${source.company}2027届管理培训生项目。${descText.slice(0, 300)}。投递前请打开官方校招页确认最新状态。`,
      salary: '',
      status: '推荐',
      discoveredAt: now.toISOString(),
      _searchText: jobText,
      _sourceJobId: jobId
    });
  }
  return jobs;
}

function emptyResult(errors = 1) {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, snapshotComplete: false } };
}

export async function search51JobCampus(profile, source, { fetcher = fetch, now = new Date() } = {}) {
  if (!source?.url) return emptyResult();
  const pageUrl = source.jobPageUrl || source.url;
  const parser = source.parser || 'unilever'; // 'unilever' or 'elc'

  let pages = 0, listed = 0, errors = 0;
  const jobs = [];
  const seen = new Set();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetcher(pageUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`51job HTTP ${response.status}`);
    const html = await response.text();
    pages = 1;

    const parsed = parser === 'elc'
      ? parseElcItems(html, source, now)
      : parseUnileverItems(html, source, now);

    for (const job of parsed) {
      if (!job._sourceJobId || seen.has(job._sourceJobId)) continue;
      seen.add(job._sourceJobId);
      listed++;
      try {
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete: errors === 0 } };
}
