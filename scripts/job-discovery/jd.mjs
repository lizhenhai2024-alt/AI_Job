import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

// 京东校招（campus.jd.com）专用适配器
// 通道：POST /api/wx/position/page?type=present（应届生，无需登录，JD 全文在列表）
// 方向字典：01采销与物流/02技术/03产品/04运营/05市场与商务/06设计/07职能/08工程/09保险及金融/10健康/15TET/30基层管理/31一线销售/32一线职能/33一线专业

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','公关','传播'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

// 保留方向：采销与物流/产品/运营/市场与商务/职能/TET/基层管理/一线职能
const DIRECTION_KEEP = new Set(['01', '03', '04', '05', '07', '15', '30', '32']);
// 方向内再剔除：财务法务风控、纯销售、技术工程、医药专业、信控审核类
const EXCLUDE_TITLE = /技术方向-|技术支持工程师|法务|财务|资金管理|税务|审计|会计|风控|合规|信控|审核|核保|精算|大客户销售|渠道销售|电话销售|销售拓展|药房管理储备|健康管理师|医务|护理|医师|医技|家政运营|医生经纪|食品研发|航空职能|工程技术|工程项目管理/;

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function citiesFrom(row = {}) {
  const list = Array.isArray(row.requirementVoList) ? row.requirementVoList : [];
  const names = list.map((r) => clean(r?.workCity)).filter(Boolean);
  // "北京市-北京市" -> "北京市"；"浙江省-杭州市" -> "杭州市"
  const short = names.map((n) => {
    const parts = n.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : n;
  });
  const uniq = [];
  for (const n of short) {
    const bare = n.replace(/市$/, '');
    const matched = CITY_NAMES.includes(n) ? n : (CITY_NAMES.includes(bare) ? bare : '');
    if (matched && !uniq.includes(matched)) uniq.push(matched);
  }
  return uniq.length ? uniq : ['待核'];
}
function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }
function tsToDate(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function parseJdJob(source, row = {}, now = new Date()) {
  const rawId = String(row.publishId || row.reqId || '');
  const title = clean(row.positionName || '');
  const direction = clean(row.jobDirection || '');
  const duty = clean(row.workContent || '');
  const requirement = clean(row.qualification || '');
  const plan = clean(row.planName || '');
  const jobText = [title, direction, plan, duty, requirement].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const cities = citiesFrom(row);
  return {
    id: `jd-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '京东',
    title,
    roleFamily,
    city: cities.join('、'),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '京东官方2027校园招聘官网',
    sourceType: 'official',
    sourceUrl: source.url || 'https://campus.jd.com/#/jobs',
    verification: '官方招聘官网/API',
    publishedAt: tsToDate(row.publishTime),
    deadline: '',
    description: `京东官方校园招聘（应届生）岗位；${direction ? `方向：${direction}。` : ''}${plan ? `项目：${plan}。` : ''}${cities.length > 1 ? `工作地（多选）：${cities.join('、')}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方校招页确认最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: duty,
    jobRequirements: requirement,
    _searchText: jobText,
    _sourceJobId: rawId
  };
}

function emptyResult(errors = 1) {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, snapshotComplete: false } };
}

async function fetchPage(fetcher, pageIndex, pageSize) {
  const base = 'https://campus.jd.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(`${base}/api/wx/position/page?type=present`, {
      method: 'POST',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'content-type': 'application/json', accept: 'application/json, text/plain, */*',
        referer: `${base}/#/jobs`, origin: base
      },
      body: JSON.stringify({
        pageSize, pageIndex,
        parameter: { positionName: '', planIdList: [], jobDirectionCodeList: [], workCityCodeList: [], positionDeptList: [] }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`JD API HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success !== true || !payload?.body) throw new Error('bad JD API payload');
    return payload.body;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchJdJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return emptyResult();
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 100), 100));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 10), 30));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));

  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    const first = await fetchPage(fetcher, 0, size);
    pages++;
    const total = Number(first?.totalNumber || 0);
    const rows = Array.isArray(first?.items) ? first.items : [];
    for (const row of rows) {
      const id = String(row?.publishId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      try {
        const job = parseJdJob(source, row, now);
        if (!job.title) continue;
        // 方向白名单 + 标题黑名单
        if (!DIRECTION_KEEP.has(String(row.jobDirectionCode || ''))) continue;
        if (EXCLUDE_TITLE.test(job.title)) continue;
        if (job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
      if (seen.size >= jobLimit) break;
    }
    // 继续翻页
    while (seen.size < total && seen.size < jobLimit && pages < pageLimit) {
      const data = await fetchPage(fetcher, pages, size);
      pages++;
      const list = Array.isArray(data?.items) ? data.items : [];
      listed += list.length;
      for (const row of list) {
        const id = String(row?.publishId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        try {
          const job = parseJdJob(source, row, now);
          if (!job.title) continue;
          if (!DIRECTION_KEEP.has(String(row.jobDirectionCode || ''))) continue;
          if (EXCLUDE_TITLE.test(job.title)) continue;
          if (job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
        if (seen.size >= jobLimit) break;
      }
      if (!list.length) break;
    }
    if (seen.size >= total || pages >= pageLimit) snapshotComplete = true;
  } catch (e) {
    errors++;
    console.warn(`[jd] fetch error: ${e.message}`);
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete } };
}
