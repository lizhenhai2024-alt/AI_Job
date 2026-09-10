import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','公关','传播'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function listNames(arr) { return Array.isArray(arr) ? arr.map((x) => clean(x?.name)).filter(Boolean) : []; }
function cityFrom(row = {}) {
  const raw = listNames(row?.cityList).join('、');
  const title = clean(row.name || '');
  return CITY_NAMES.find((c) => title.includes(c)) || CITY_NAMES.find((c) => raw.includes(c)) || raw || '待核';
}
function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }
function tsToDate(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function parseMeituanJob(source, row = {}, now = new Date()) {
  const rawId = String(row.jobUnionId || row.id || '');
  const title = clean(row.name || '');
  const duty = clean(row.jobDuty || '');
  const requirement = clean(row.jobRequirement || '');
  const highlight = clean(row.highLight || '');
  const family = clean(row.jobFamily || row.jobFamilyGroup || '');
  const department = listNames(row?.department).join('、');
  const jobText = [title, family, department, duty, requirement, highlight].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `meituan-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '美团',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '美团官方2027校招官网',
    sourceType: 'official',
    sourceUrl: source.url || 'https://zhaopin.meituan.com/web/campus',
    verification: '官方招聘官网/API',
    publishedAt: tsToDate(row.firstPostTime) || tsToDate(row.refreshTime),
    deadline: tsToDate(row.expiredTime),
    description: `美团官方校园招聘（应届生）岗位；${family ? `职类：${family}。` : ''}${department ? `部门：${department}。` : ''}${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方校招页确认最新状态。`,
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

async function fetchPage(fetcher, source, pageNo, pageSize) {
  const base = 'https://zhaopin.meituan.com';
  const body = {
    page: { pageNo, pageSize },
    jobShareType: '1', keywords: '', cityList: [], department: [], jfJgList: [],
    // code 1 = 应届生（全职校招）；code 2 = 转正实习，code 6 = 日常实习，均排除
    jobType: [{ code: '1', subCode: [] }],
    typeCode: [], specialCode: [],
    u_query_id: 'ai-job-probe', r_query_id: String(Date.now())
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(`${base}/api/official/job/getJobList`, {
      method: 'POST',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'content-type': 'application/json', accept: 'application/json, text/plain, */*',
        referer: `${base}/web/campus`, origin: base
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Meituan API HTTP ${response.status}`);
    const payload = await response.json();
    if (Number(payload?.status) !== 1) throw new Error(payload?.message || 'bad Meituan API payload');
    return payload?.data || {};
  } finally {
    clearTimeout(timer);
  }
}

export async function searchMeituanJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return emptyResult();
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 10), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 30), 60));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));

  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    for (let pageNo = 1; pageNo <= pageLimit && seen.size < jobLimit; pageNo++) {
      const data = await fetchPage(fetcher, source, pageNo, size);
      pages++;
      const list = Array.isArray(data.list) ? data.list : [];
      listed += list.length;
      for (const row of list) {
        const id = String(row?.jobUnionId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        try {
          const job = parseMeituanJob(source, row, now);
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
        if (seen.size >= jobLimit) break;
      }
      const totalPage = Number(data?.page?.totalPage || 0);
      if (!list.length || pageNo >= totalPage) { snapshotComplete = true; break; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete } };
}
