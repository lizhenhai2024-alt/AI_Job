import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['德语', /德语|German/i], ['法语', /法语|French/i],
  ['西班牙语', /西语|西班牙语|Spanish/i], ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i],
  ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i], ['俄语', /俄语|Russian/i], ['阿拉伯语', /阿语|阿拉伯语|Arabic/i]
];

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function cityFrom(row = {}) {
  const names = Array.isArray(row.city_list) ? row.city_list.map((x) => clean(x?.name)).filter(Boolean) : [];
  const raw = names.join('、');
  const title = clean(row.title || '');
  return CITY_NAMES.find((city) => title.includes(city)) || CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}
function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([name]) => name); }
function publishedAt(row = {}) {
  const ts = Number(row.publish_time || 0);
  if (!ts) return '';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
}
function directUrl(source, id) {
  const base = String(source.apiBase || 'https://jobs.ecoflow.com').replace(/\/$/, '');
  return id ? `${base}/${source.websitePath || '602892'}/position/${encodeURIComponent(id)}/detail` : source.url;
}

export function parseEcoflowJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.title || '');
  const descriptionText = clean(row.description || '');
  const requirementText = clean(row.requirement || '');
  // Feishu Hire tenants may use job_category for an industry taxonomy while
  // job_function carries the actual functional family (运营/市场/产品/职能...).
  // EcoFlow currently exposes the former as “能源 / 矿产 / 环保 ...”, so prefer
  // job_function for human-facing role explanations and fall back to category.
  const category = clean(row?.job_function?.name || row?.job_category?.name || '');
  const recruitType = clean(row?.recruit_type?.name || '');
  const jobText = [title, category, recruitType, descriptionText, requirementText].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `ecoflow-${rawId || crypto.createHash('sha1').update(`${title}|${cityFrom(row)}`).digest('hex').slice(0,12)}`,
    company: source.company || '正浩创新EcoFlow',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((word) => jobText.toLowerCase().includes(word.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '正浩创新EcoFlow官方2027校招官网',
    sourceType: 'official',
    sourceUrl: directUrl(source, rawId),
    verification: '官方招聘官网/API',
    publishedAt: publishedAt(row),
    deadline: '',
    description: `EcoFlow 官方 2027 秋季校园招聘岗位；${category ? `职类：${category}。` : ''}${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: extractSalary(jobText),
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: descriptionText,
    jobRequirements: requirementText,
    _searchText: jobText,
    _recruitType: recruitType
  };
}

function baseHeaders(source, token = '', cookie = '') {
  const websitePath = String(source.websitePath || '602892');
  const base = String(source.apiBase || 'https://jobs.ecoflow.com').replace(/\/$/, '');
  const headers = {
    'website-path': websitePath,
    'portal-channel': 'saas-career',
    'portal-platform': 'pc',
    referer: `${base}/${websitePath}/position/list`,
    'content-type': 'application/json',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN',
    'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.6)'
  };
  if (token) headers['x-csrf-token'] = token;
  if (cookie) headers.cookie = cookie;
  return headers;
}

async function session(fetcher, source) {
  const base = String(source.apiBase || 'https://jobs.ecoflow.com').replace(/\/$/, '');
  const response = await fetcher(`${base}/api/v1/csrf/token`, { method: 'POST', headers: baseHeaders(source) });
  if (!response.ok) return { token: '', cookie: '' };
  let token = '';
  try { token = String((await response.json())?.data?.token || ''); } catch {}
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const cookie = cookies.map((part) => String(part).split(';')[0].trim()).filter((part) => /=/.test(part)).join('; ');
  return { token, cookie };
}

async function fetchPage(fetcher, source, auth, offset, limit) {
  const base = String(source.apiBase || 'https://jobs.ecoflow.com').replace(/\/$/, '');
  const portalType = Number(source.portalType || 6);
  const body = { keyword: '', limit, offset, portal_type: portalType, portal_entrance: 1 };
  const params = new URLSearchParams({
    keyword: '', limit: String(limit), offset: String(offset), job_category_id_list: '', tag_id_list: '', location_code_list: '',
    subject_id_list: '', recruitment_id_list: '', portal_type: String(portalType), job_function_id_list: '', storefront_id_list: '', portal_entrance: '1'
  });
  const response = await fetcher(`${base}/api/v1/search/job/posts?${params}`, {
    method: 'POST', headers: baseHeaders(source, auth.token, auth.cookie), body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`EcoFlow API HTTP ${response.status}`);
  const payload = await response.json();
  const posts = payload?.data?.job_post_list;
  if (!Array.isArray(posts)) throw new Error('EcoFlow API payload missing data.job_post_list');
  return posts;
}

export async function searchEcoflowJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url || !source?.websitePath) return { jobs: [], stats: { pages: 0, listed: 0, keptJobs: 0, errors: 1, snapshotComplete: false, emptyResult: true } };
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 10), 10));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 60), 100));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();
  try {
    const auth = await session(fetcher, source);
    for (let page = 0, offset = 0; page < pageLimit && seen.size < jobLimit; page++) {
      const rows = await fetchPage(fetcher, source, auth, offset, size);
      pages++;
      listed += rows.length;
      for (const row of rows) {
        const id = String(row?.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const job = parseEcoflowJob(source, row, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
        if (seen.size >= jobLimit) break;
      }
      if (rows.length < size) { snapshotComplete = true; break; }
      offset += rows.length;
      if (!rows.length) { snapshotComplete = true; break; }
    }
  } catch { errors++; }

  // An active, registered official campus source returning zero jobs is a source-health
  // anomaly, not a valid "complete empty snapshot". Mark it unhealthy so API/schema
  // changes cannot silently erase EcoFlow from the radar while CI stays green.
  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) errors++;
  if (emptyResult) snapshotComplete = false;

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, keptJobs: kept.length, errors, snapshotComplete, emptyResult } };
}
