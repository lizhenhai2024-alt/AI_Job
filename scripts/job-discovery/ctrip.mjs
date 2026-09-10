import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','人力资源'];

// Ctrip returns cityName in either Chinese or English (e.g. "Shanghai").
// Map common English names back to the Chinese city names used by CITY_NAMES.
const CITY_EN_TO_ZH = {
  'beijing': '北京', 'shanghai': '上海', 'guangzhou': '广州', 'shenzhen': '深圳',
  'chengdu': '成都', 'hangzhou': '杭州', 'nanjing': '南京', 'suzhou': '苏州',
  'wuhan': '武汉', 'changsha': '长沙', 'tianjin': '天津', 'chongqing': '重庆',
  'nantong': '南通', 'xiamen': '厦门', 'qingdao': '青岛',
  'jinan': '济南', 'guilin': '桂林', 'sanya': '三亚', 'haikou': '海口',
  'zhengzhou': '郑州', 'kunming': '昆明', 'dalian': '大连', 'ningbo': '宁波',
  'foshan': '佛山', 'dongguan': '东莞', 'zhuhai': '珠海',
  'hong kong': '香港', 'singapore': '新加坡',
  'tokyo': '东京', 'seoul': '首尔', 'bangkok': '曼谷', 'kuala lumpur': '吉隆坡',
  'manila': '马尼拉', 'new york': '纽约', 'london': '伦敦'
};

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityFrom(row = {}) {
  let raw = String(row.cityName || row.city || '').trim();
  if (!raw) return '待核';
  const lower = raw.toLowerCase();
  if (CITY_EN_TO_ZH[lower]) raw = CITY_EN_TO_ZH[lower];
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

function languagesFrom(text) {
  const found = [];
  if (/英语|英文|English|CET/i.test(text)) found.push('英语');
  if (/日语|Japanese/i.test(text)) found.push('日语');
  if (/韩语|Korean/i.test(text)) found.push('韩语');
  if (/阿拉伯语|Arabic/i.test(text)) found.push('阿拉伯语');
  if (/西班牙语|Spanish/i.test(text)) found.push('西班牙语');
  if (/法语|French/i.test(text)) found.push('法语');
  if (/德语|German/i.test(text)) found.push('德语');
  if (/葡萄牙语|Portuguese/i.test(text)) found.push('葡萄牙语');
  return [...new Set(found)];
}

function detailUrl(source, jobId) {
  const base = String(source.url || 'https://careers.ctrip.com/').split('#')[0].replace(/\/$/, '');
  return jobId ? `${base}/#/campus/jobDetail?jobId=${encodeURIComponent(jobId)}` : `${base}/#/campus/jobList`;
}

export function parseCtripJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || row.jobId || '');
  const fromId = String(row.fromId || '');
  const title = clean(row.jobTitle || '');
  const requirements = clean(row.requirements || '');
  const duty = clean(row.duty || '');
  const family = clean(row.jobFamilyGroupName || '');
  const buName = clean(row.buName || '');
  const kindName = clean(row.kindName || '');
  const jobText = [title, family, buName, kindName, duty, requirements].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const experienceKeywords = EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `ctrip-${crypto.createHash('sha1').update(`${rawId}|${fromId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '携程集团',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords,
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '携程集团官方2027校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl(source, row.jobId || rawId),
    verification: '官方招聘官网/API',
    publishedAt: clean(row.publishDate || ''),
    deadline: '',
    description: `携程集团官方 2027 秋季校园招聘岗位；${family ? `职类：${family}。` : ''}${buName ? `业务线：${buName}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态与截止日期。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),    jobDescription: row.description || '',
    jobRequirements: row.requirement || '',

    _searchText: jobText,
    _fromId: fromId,
    _kindName: kindName
  };
}

async function postPage(fetcher, source, pageIndex, pageSize) {
  const base = String(source.apiBase || 'https://careers.ctrip.com').replace(/\/$/, '');
  const category = Number(source.category || 2);
  const body = {
    condition: {
      fromId: [], keyword: '', kind: [], country: [], city: [],
      bucode: [], jobFamilyCode: [], jobFamilyGroupCode: [], category
    },
    pager: { index: String(pageIndex), size: String(pageSize) },
    head: { language: 'zh_CN', version: '1' }
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const response = await fetcher(`${base}/api/hrrecruit/getJobAd`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.6)',
        origin: base,
        referer: `${base}/`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.retCode !== '201') throw new Error(payload?.retMessage || 'bad Ctrip payload');
    return payload?.retValue || {};
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCtripJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false } };
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 10), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 30), 60));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  let pages = 0, listed = 0, detailed = 0, errors = 0;
  const jobs = [];
  const seen = new Set();
  let snapshotComplete = false;

  try {
    for (let page = 1; page <= pageLimit && seen.size < jobLimit; page++) {
      const data = await postPage(fetcher, source, page, size);
      pages++;
      const rows = Array.isArray(data.recruitJobAdList) ? data.recruitJobAdList : [];
      listed += rows.length;
      detailed += rows.length;
      let added = 0;
      for (const row of rows) {
        const id = String(row?.id || row?.jobId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        added++;
        const job = parseCtripJob(source, row, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
        if (seen.size >= jobLimit) break;
      }
      const total = Number(data.total || 0);
      if (!rows.length || added === 0 || (total && seen.size >= total)) {
        snapshotComplete = true;
        break;
      }
    }
  } catch {
    errors++;
  }

  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) errors++;
  if (emptyResult) snapshotComplete = false;

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, snapshotComplete, emptyResult } };
}
