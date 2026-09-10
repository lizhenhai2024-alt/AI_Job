import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘'];
const BASE = 'https://join.qq.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
// join.qq.com returns workCities like "深圳总部 北京 上海 ..." or workCityList ["深圳总部","北京"]
function cityFrom(listRow = {}, detail = {}) {
  const listText = clean(listRow.workCities || '');
  const detailList = Array.isArray(detail.workCityList) ? detail.workCityList.map(clean) : [];
  const raw = [listText, ...detailList].filter(Boolean).join(' ');
  // "深圳总部" -> 深圳：优先命中标准城市名
  return CITY_NAMES.find((city) => raw.includes(city)) || detailList.join('、') || listText || '待核';
}
function languagesFrom(text = '') {
  const out = [];
  if (/英语|英文|English|CET|雅思|托福/i.test(text)) out.push('英语');
  return out;
}
function detailUrl(postId = '') {
  return postId ? `${BASE}/post_detail.html?postid=${encodeURIComponent(postId)}` : `${BASE}/post.html`;
}

export function parseTencentJob(source, listRow = {}, detail = {}, now = new Date()) {
  const postId = String(listRow.postId || detail.postId || listRow.id || '');
  const title = clean(listRow.positionTitle || detail.title || '');
  const tidName = clean(detail.tidName || listRow.projectName || '');
  const desc = clean(detail.desc || '');
  const request = clean(detail.request || '');
  const bg = clean(listRow.bgs || '');
  const jobText = [title, tidName, bg, desc, request].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `tencent-${crypto.createHash('sha1').update(`${postId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '腾讯',
    title,
    roleFamily,
    city: cityFrom(listRow, detail),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '腾讯校招官网join.qq.com 2027校园招聘',
    sourceType: 'official',
    sourceUrl: detailUrl(postId),
    verification: '官方招聘官网/API',
    publishedAt: '',
    deadline: '',
    description: `腾讯 2027 校园招聘岗位${tidName ? `（职类：${tidName}）` : ''}；${bg ? `BG：${bg}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText
  };
}

async function searchList(fetcher, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${BASE}/api/v1/position/searchPosition?timestamp=${Date.now()}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA, accept: 'application/json, text/plain, */*', 'accept-language': 'zh-CN',
        'content-type': 'application/json', referer: `${BASE}/post.html`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`searchPosition HTTP ${res.status}`);
    const payload = await res.json();
    if (payload.status !== 0) throw new Error(payload.message || 'bad searchPosition payload');
    return payload.data || {};
  } finally { clearTimeout(timer); }
}

async function fetchDetail(fetcher, postId, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${BASE}/api/v1/jobDetails/getJobDetailsByPostId?timestamp=${Date.now()}&postId=${encodeURIComponent(postId)}`, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/json, */*', 'accept-language': 'zh-CN', referer: `${BASE}/post_detail.html?postid=${encodeURIComponent(postId)}` }
    });
    if (!res.ok) throw new Error(`getJobDetailsByPostId HTTP ${res.status}`);
    const payload = await res.json();
    if (payload.status !== 0) throw new Error(payload.message || 'bad detail payload');
    return payload.data || {};
  } finally { clearTimeout(timer); }
}

export async function searchTencentJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, timeoutMs = 15000, now = new Date() } = {}) {
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 20), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 30), 60));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  // mappingId 1 = "2027校园招聘"（应届毕业生）。只取全职校招，排除实习。
  const mappingIds = Array.isArray(source.projectMappingIdList) && source.projectMappingIdList.length ? source.projectMappingIdList : [1];
  let pages = 0, listed = 0, detailed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    for (let pageIndex = 1; pageIndex <= pageLimit && seen.size < jobLimit; pageIndex++) {
      const data = await searchList(fetcher, {
        projectIdList: [], projectMappingIdList: mappingIds, keyword: '', bgList: [],
        workCountryType: 0, workCityList: [], recruitCityList: [], positionFidList: [],
        pageIndex, pageSize: size
      }, timeoutMs);
      pages++;
      const rows = Array.isArray(data.positionList) ? data.positionList : [];
      listed += rows.length;
      if (!rows.length) { snapshotComplete = true; break; }
      for (const row of rows) {
        const postId = String(row.postId || row.id || '');
        if (!postId || seen.has(postId)) continue;
        seen.add(postId);
        if (seen.size > jobLimit) break;
        try {
          const detail = await fetchDetail(fetcher, postId, timeoutMs);
          detailed++;
          const job = parseTencentJob(source, row, detail, now);
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
      }
      const total = Number(data.count || 0);
      if (rows.length < size || seen.size >= total) { snapshotComplete = true; break; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, snapshotComplete } };
}
