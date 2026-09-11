import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, htmlToText, decodeHtml } from './core.mjs';

const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];
const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','公关','传播','财务','人力资源'];

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function cityFrom(job = {}) {
  const rawCity = clean(job.city || '');
  const rawLocation = clean(job.location || '');
  const rawState = clean(job.state || '');
  return CITY_NAMES.find((c) => rawLocation.includes(c))
    || CITY_NAMES.find((c) => rawCity.includes(c))
    || CITY_NAMES.find((c) => rawState.includes(c))
    || rawCity || rawLocation || '待核';
}

function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }

function parsePhenomJob(source, job = {}, now = new Date()) {
  const rawId = String(job.jobSeqNo || job.reqId || job.jobId || '');
  const title = clean(job.title || '');
  const category = clean(job.category || '');
  const subCategory = clean(job.subCategory || '');
  const teaser = clean(job.descriptionTeaser || '');
  const applyUrl = clean(job.applyUrl || '');
  const skills = Array.isArray(job.ml_skills) ? job.ml_skills.map(clean).filter(Boolean).slice(0, 8) : [];
  const postedDate = String(job.postedDate || '').slice(0, 10);
  const jobText = [title, category, subCategory, teaser].filter(Boolean).join('\n');
  const allSkills = detectSkills(jobText);
  const mergedSkills = [...new Set([...skills.map((s) => detectSkills(s)[0]).filter(Boolean), ...allSkills])].slice(0, 8);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `phenom-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '',
    title,
    roleFamily,
    city: cityFrom(job),
    graduationYear: String(source.graduationYear || '2027'),
    skills: mergedSkills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: `${source.company}官方校招官网`,
    sourceType: 'official',
    sourceUrl: applyUrl || source.url || '',
    verification: '官方招聘官网',
    publishedAt: postedDate,
    deadline: '',
    description: `${source.company}官方校园招聘岗位；${category ? `部门：${category}。` : ''}${subCategory ? `子类：${subCategory}。` : ''}${teaser ? `简介：${teaser.slice(0, 200)}。` : ''}投递前请打开官方校招页确认最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText,
    _sourceJobId: rawId
  };
}

function emptyResult(errors = 1) {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, snapshotComplete: false } };
}

function extractRefineSearch(html) {
  const m = html.match(/phApp\.ddo\s*=\s*(\{[\s\S]*?\});\s*phApp\.experimentData/);
  if (!m) return null;
  try {
    const ddo = JSON.parse(m[1]);
    return ddo?.eagerLoadRefineSearch || null;
  } catch {
    return null;
  }
}

function extractCsrfToken(html) {
  const m = html.match(/phApp\.sessionParams\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return '';
  try {
    const params = JSON.parse(m[1]);
    return params?.csrfToken || '';
  } catch {
    return '';
  }
}

async function fetchPage(fetcher, source, pageNo) {
  const baseUrl = source.baseUrl || 'https://careers.pg.com.cn';
  const langPath = source.langPath || '/cn/zh';
  const keyword = Array.isArray(source.includeTitle) && source.includeTitle.length
    ? encodeURIComponent(String(source.includeTitle[0]))
    : '';
  const url = `${baseUrl}${langPath}/search-results?${keyword ? `keywords=${keyword}&` : ''}page=${pageNo}&pagesize=20`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Phenom HTTP ${response.status}`);
    const html = await response.text();
    const refine = extractRefineSearch(html);
    if (!refine) return { jobs: [], totalHits: 0 };
    return {
      jobs: refine?.data?.jobs || [],
      totalHits: Number(refine?.totalHits || 0),
      hits: Number(refine?.hits || 0)
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPhenomJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url || !source?.refNum) return emptyResult();
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 10), 30));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 200), 600));

  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    for (let pageNo = 1; pageNo <= pageLimit && seen.size < jobLimit; pageNo++) {
      const data = await fetchPage(fetcher, source, pageNo);
      pages++;
      const list = Array.isArray(data.jobs) ? data.jobs : [];
      listed += list.length;
      for (const row of list) {
        const id = String(row?.jobSeqNo || row?.reqId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        try {
          const job = parsePhenomJob(source, row, now);
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          const includeTitle = Array.isArray(source.includeTitle) ? source.includeTitle : [];
          const titleHit = includeTitle.length
            ? includeTitle.some((token) => job.title.includes(token) || String(job._searchText || '').includes(token))
            : true;
          if (!titleHit) continue;
          const campusFriendly = /品牌|Brand|市场|Marketing|增长|HR|人力|供应链|传播|公关|CBD|Campus/i.test(job.title);
          if (shouldKeep(job, profile, now) || campusFriendly) jobs.push(job);
        } catch { errors++; }
        if (seen.size >= jobLimit) break;
      }
      const totalHits = Number(data.totalHits || 0);
      if (!list.length || seen.size >= totalHits) { snapshotComplete = true; break; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete } };
}
