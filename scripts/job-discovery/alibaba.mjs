import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘'];
const BASE = 'https://campus-talent.alibaba.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
// 当前 2027 校招批次（毕业时间窗 2026.09 - 2027.12）。
const DEFAULT_BATCH_ID = 100000760001;

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function cityFrom(row = {}) {
  const locations = Array.isArray(row.workLocations) ? row.workLocations.map(clean).filter(Boolean) : [];
  const raw = locations.join('、');
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}
function languagesFrom(text = '') {
  const out = [];
  if (/英语|英文|English|CET|雅思|托福/i.test(text)) out.push('英语');
  return out;
}
function detailUrl(row = {}) {
  const id = row.id || '';
  return id ? `${BASE}/campus/position/detail?id=${encodeURIComponent(id)}` : `${BASE}/campus/position`;
}

export function parseAlibabaJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.name || '');
  const descriptionText = clean(row.description || '');
  const requirementText = clean(row.requirement || '');
  const jobText = [title, descriptionText, requirementText].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `alibaba-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '阿里巴巴',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '阿里巴巴官方校招官网campus-talent 2027校园招聘',
    sourceType: 'official',
    sourceUrl: detailUrl(row),
    verification: '官方招聘官网/API',
    publishedAt: '',
    deadline: '',
    description: `阿里巴巴 2027 校园招聘岗位；${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态与截止日期。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),    jobDescription: descriptionText,
    jobRequirements: requirementText,

    _searchText: jobText
  };
}

// 阿里校招门户是 CSRF + SESSION Cookie 双因子：先 GET 页面拿到 XSRF-TOKEN，
// 再把同一个 token 作为 ?_csrf 拼到 POST 上，并带上 Cookie。
async function bootstrap(fetcher, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${BASE}/campus/position`, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'zh-CN' }
    });
    if (!res.ok) return { token: '', cookie: '' };
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    const cookie = setCookies.map((part) => String(part).split(';')[0].trim()).filter((part) => /=/.test(part)).join('; ');
    const html = await res.text();
    const token = (html.match(/__token__\s*[:=]\s*["']([0-9a-f-]{36})["']/i) || [])[1]
      || (setCookies.map((c) => c.split(';')[0]).find((c) => /XSRF-TOKEN/i.test(c)) || '').split('=')[1] || '';
    return { token, cookie };
  } catch { return { token: '', cookie: '' }; }
  finally { clearTimeout(timer); }
}

async function searchPage(fetcher, auth, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${BASE}/position/search?_csrf=${encodeURIComponent(auth.token)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA, accept: 'application/json, text/plain, */*', 'accept-language': 'zh-CN',
        'content-type': 'application/json', referer: `${BASE}/campus/position`, cookie: auth.cookie
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`position/search HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload || payload.success !== true) throw new Error(payload?.errorMsg || 'bad position/search payload');
    return payload.content || {};
  } finally { clearTimeout(timer); }
}

export async function searchAlibabaJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, batchId, timeoutMs = 15000, now = new Date() } = {}) {
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 20), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 30), 60));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  const batch = batchId || source.batchId || DEFAULT_BATCH_ID;
  const channel = source.channel || 'campus_group_official_site';
  let pages = 0, listed = 0, detailed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    const auth = await bootstrap(fetcher, timeoutMs);
    if (!auth.token) { errors++; return { jobs, stats: { pages, listed, detailed, keptJobs: 0, errors, snapshotComplete } }; }
    for (let pageIndex = 1; pageIndex <= pageLimit && seen.size < jobLimit; pageIndex++) {
      const data = await searchPage(fetcher, auth, {
        batchId: batch, pageIndex, pageSize: size, channel, language: 'zh'
      }, timeoutMs);
      pages++;
      const rows = Array.isArray(data.datas) ? data.datas : [];
      listed += rows.length;
      detailed += rows.length; // 列表项已含职责/要求，无需二次详情请求
      if (!rows.length) { snapshotComplete = true; break; }
      for (const row of rows) {
        const id = String(row.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (seen.size > jobLimit) break;
        try {
          const job = parseAlibabaJob(source, row, now);
          if (!job.title || job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) jobs.push(job);
        } catch { errors++; }
      }
      const total = Number(data.totalCount || 0);
      if (rows.length < size || seen.size >= total) { snapshotComplete = true; break; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, snapshotComplete } };
}
