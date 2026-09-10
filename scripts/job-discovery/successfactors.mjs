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

function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }

function cityFromText(text) {
  return CITY_NAMES.find((c) => text.includes(c)) || '全国';
}

/**
 * Parse SAP SuccessFactors RMK career site job listing HTML.
 * SF career sites render job entries with data attributes and links to /job/{id} or /sf/job/{id}.
 */
function parseSFJobs(html, source, now) {
  const jobs = [];
  const seen = new Set();

  // SF career sites typically have job links like /job/12345 or /sf/job/12345
  // Also look for data-js-load="job-details" or similar SF patterns
  const patterns = [
    /<a[^>]+href="([^"]*\/job\/(\d+)[^"]*)"[^>]*>/gi,
    /<a[^>]+href="([^"]*\/sf\/job\/(\d+)[^"]*)"[^>]*>/gi,
    /data-app-url="([^"]*\/job\/(\d+)[^"]*)"/gi
  ];

  const links = new Map();
  for (const pattern of patterns) {
    for (const m of html.matchAll(pattern)) {
      const [, href, jobId] = m;
      if (!seen.has(jobId)) {
        seen.add(jobId);
        links.set(jobId, href.startsWith('http') ? href : `https://jobs.colgate.com${href}`);
      }
    }
  }

  // Also try to extract job titles from the HTML
  // SF typically uses elements like <span class="jobTitle"> or data attributes
  const titleRegex = /class="[^"]*jobTitle[^"]*"[^>]*>([^<]+)</gi;
  const titles = [...html.matchAll(titleRegex)].map(([, t]) => clean(t)).filter(Boolean);

  let idx = 0;
  for (const [jobId, href] of links) {
    const title = titles[idx] || '';
    idx++;
    if (!title) continue;

    // Extract surrounding text for description
    const linkIdx = html.indexOf(href.split('jobs.colgate.com')[1] || href);
    const surrounding = linkIdx >= 0 ? html.slice(linkIdx, linkIdx + 3000) : '';
    const descText = htmlToText(surrounding).slice(0, 500);

    const jobText = [title, descText].join('\n');
    const skills = detectSkills(jobText);
    const roleFamily = classifyRole(title);
    const preferenceTags = [
      /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
      /跨文化|本地化|多语种/i.test(jobText) ? '跨文化' : ''
    ].filter(Boolean);

    jobs.push({
      id: `sf-${crypto.createHash('sha1').update(`${jobId}|${title}`).digest('hex').slice(0, 12)}`,
      company: source.company || '高露洁',
      title,
      roleFamily,
      city: cityFromText(jobText),
      graduationYear: String(source.graduationYear || '2027'),
      skills,
      languages: languagesFrom(jobText),
      experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
      preferenceTags,
      riskTags: detectRisks(jobText),
      source: `${source.company}官方校招官网`,
      sourceType: 'official',
      sourceUrl: href,
      verification: '官方招聘官网（SAP SuccessFactors平台）',
      publishedAt: '',
      deadline: '',
      description: `${source.company}官方招聘岗位；${title}。${descText.slice(0, 200)}。投递前请打开官方校招页确认最新状态。`,
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

export async function searchSuccessFactorsJobs(profile, source, { fetcher = fetch, maxJobs, maxPages, now = new Date() } = {}) {
  if (!source?.url) return emptyResult();
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 200), 500));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 5), 10));

  let pages = 0, listed = 0, errors = 0;
  const jobs = [];
  const seen = new Set();
  const baseUrl = source.baseUrl || 'https://jobs.colgate.com';

  try {
    for (let pageNo = 1; pageNo <= pageLimit && seen.size < jobLimit; pageNo++) {
      // SF career sites: try the search results page
      const url = `${baseUrl}/?locale=zh_CN&page=${pageNo}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetcher(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`SF HTTP ${response.status}`);
      const html = await response.text();
      pages++;

      const parsed = parseSFJobs(html, source, now);
      let newCount = 0;
      for (const job of parsed) {
        if (!job._sourceJobId || seen.has(job._sourceJobId)) continue;
        seen.add(job._sourceJobId);
        listed++;
        newCount++;
        try {
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
      }
      if (newCount === 0) break;
      if (seen.size >= jobLimit) break;
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete: errors === 0 } };
}
