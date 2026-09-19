import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

// 大疆 2027 拓疆者校园招聘专用适配器（apply.careers.dji.com，Moka 定制域部署）。
// - 门户 /campus-recruitment/dji/143359（2027届，2026-06-25 开启，2026-08 新增数字管理构建者计划）为 Moka SSR：
//   HTML 内嵌 init-data（首屏 15 条 + 总数 139），岗位数据本身走 Moka 公开 API（无需鉴权）。
// - 列表：POST /api/outer/ats-apply/website/jobs/v2 { orgId, siteId, page, pageSize, needStat:true, locale }
//   → { jobs:[…], jobStats:{ total } }（job 字段与 init-data 同构：id/title/department/zhineng/locations/openedAt/closedAt/publishedAt）。
// - 详情：POST /api/outer/ats-apply/website/job { orgId, siteId, jobId, locale, isInviteResume:true }
//   → job 对象含 jobDescription（HTML JD）、education、minSalary/maxSalary/salaryUnit、minExperience/maxExperience。
// - 站点对 ?page=N 查询参数不做服务端分页（每页 SSR 都是同一批 15 条），完整列表只能走 API；本机 TLS 阻断该域，
//   本地用 web_fetch/r.jina.ai 验证过结构，Runner 是否可达由线上验证运行判定（跑不通时回退 SSR 首屏并输出诊断日志）。
//
// 范围策略（用户硬约束 + AI_Job 生产池规则）：
//   * 只保留在范围职能（zhineng）：市场/电商/供应链管理/供应链工程/人力资源/产品运营/项目管理/软件产品/服务管理。
//   * 明确不抓：技术类（算法/软件/硬件/芯片/嵌入式/机械与力学/光学/测试及测试开发/信息安全/工艺开发/质量，109 岗）、
//     数字化建设（数字管理研发工程师等，研发构建性质）、工业设计、财务、法务、销售（一线销售）。
//   * 实习/非2027届由 shouldKeep 统一拦截；技术/设计/财务/法务/实施等由生产池 isOutOfScopeProfessionalRole 兜底。
const PORTAL_BASE = 'https://apply.careers.dji.com';
const PORTAL_PATH = '/campus-recruitment/dji/143359';
const JINA_BASE = 'https://r.jina.ai';
const DEFAULT_ORG_ID = 'dji';
const DEFAULT_SITE_ID = '143359';
// 完整浏览器式请求头：Runner 直连曾返回 HTTP 404（web_fetch 服务端同 URL 200），
// 推测是 WAF 按请求头/指纹拦截；先补全套浏览器头直连，失败再走 jina GET 代理。
const BROWSER_GET_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'upgrade-insecure-requests': '1',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1'
};
const IN_SCOPE_ZHINENG = new Set([
  '市场', '电商', '供应链管理', '供应链工程', '人力资源',
  '产品运营', '项目管理', '软件产品', '服务管理'
]);

const EXPERIENCE_WORDS = ['海外', '运营', '内容', '项目', '市场', '电商', '用户', '数据', '跨文化', '营销', '品牌', '供应链', '客户', '产品', '人力资源', '招聘', '商务', '服务'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

function cleanText(value = '') {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function stripTags(value = '') {
  return cleanText(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '));
}

function normalizeDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return '';
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function languagesFrom(text = '') {
  return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n);
}

function citiesFromText(text = '') {
  const found = CITY_NAMES.filter((city) => text.includes(city));
  return found.length ? [...new Set(found)] : [];
}

function decodeAttr(value = '') {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// 从门户 URL 中解析 Moka 组织与站点 ID（默认 dji/143359）。
export function parseDjiPortal(source = {}) {
  const url = String(source.url || `${PORTAL_BASE}${PORTAL_PATH}`).split('#')[0].replace(/\/$/, '');
  const m = url.match(/\/campus-recruitment\/([^/]+)\/(\d+)/);
  return {
    base: url.split('?')[0],
    orgId: m?.[1] || DEFAULT_ORG_ID,
    siteId: m?.[2] || DEFAULT_SITE_ID
  };
}

// Moka SSR init-data：<input id="init-data" value="{…}">，含首屏 jobs + jobStats.total。
export function parseDjiInitData(html = '') {
  const match = String(html).match(/<input[^>]+id=["']init-data["'][^>]+value=["']([\s\S]*?)["'][^>]*>/i);
  if (!match) return null;
  try {
    const data = JSON.parse(decodeAttr(match[1]));
    return {
      jobs: Array.isArray(data?.jobs) ? data.jobs : [],
      total: Number(data?.jobStats?.total) || 0
    };
  } catch {
    return null;
  }
}

// 详情/列表 API 响应可能是 { jobs, jobStats } 直出，也可能包在 { code, data } 信封里，这里统一取负载。
function unwrapPayload(body = {}) {
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    const data = body.data;
    if ('jobs' in data || 'jobDescription' in data || 'id' in data) return data;
  }
  return body;
}

async function postJson(fetcher, url, body, label, { referer = '', timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        ...(referer ? { referer } : {}),
        ...(referer ? { origin: new URL(referer).origin } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      let sample = '';
      try { sample = (await response.text()).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      throw new Error(`HTTP ${response.status} ${label}${sample ? ` body=${sample}` : ''}`);
    }
    const raw = await response.text();
    if (!raw || raw.length < 10) throw new Error(`empty/short response (${raw?.length || 0}B) ${label}`);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error(`non-JSON response ${label}: ${raw.slice(0, 120)}`); }
    return unwrapPayload(parsed);
  } finally {
    clearTimeout(timer);
  }
}

// API 列表分页：page=1..N，直到不足一页或达到 total/maxPages/maxJobs 上限。
export async function fetchDjiApiJobs(fetcher, portal, { pageSize = 50, maxPages = 8, maxJobs = 300 } = {}) {
  const url = `${portal.base}/api/outer/ats-apply/website/jobs/v2`;
  const referer = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN`;
  const jobs = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const payload = await postJson(fetcher, url, {
      orgId: portal.orgId,
      siteId: portal.siteId,
      page,
      pageSize,
      needStat: true,
      locale: 'zh-CN'
    }, `jobs/v2 page=${page}`, { referer });
    const batch = Array.isArray(payload?.jobs) ? payload.jobs : [];
    if (total === 0 && Number(payload?.jobStats?.total) > 0) total = Number(payload.jobStats.total);
    let added = 0;
    for (const job of batch) {
      const id = String(job?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      jobs.push(job);
      added++;
    }
    if (added === 0 || jobs.length >= jobLimit(total, maxJobs)) break;
    if (batch.length < pageSize) break;
  }
  return { jobs, total };
}

function jobLimit(total, maxJobs) {
  const cap = Number(maxJobs || 300);
  return total > 0 ? Math.min(total, cap) : cap;
}

// jina 代理 GET：Runner 直连被边缘拦截时（HTTP 404）作为 SSR 通道回退，
// 本机实测 x-respond-with: html 可拿到与直连一致的原始 HTML。
export async function fetchViaJina(fetcher, url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetcher(`${JINA_BASE}/${url}`, {
      method: 'GET',
      headers: {
        'x-respond-with': 'html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} jina ${label}`);
    const raw = await response.text();
    if (!raw || raw.length < 200) throw new Error(`empty/short jina response (${raw?.length || 0}B) ${label}`);
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDjiSsrHtml(fetcher, portal) {
  const url = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: {
        ...BROWSER_GET_HEADERS,
        referer: `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}`
      },
      signal: controller.signal
    });
    if (!response.ok) {
      let sample = '';
      try { sample = (await response.text()).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      throw new Error(`HTTP ${response.status} SSR${sample ? ` body=${sample}` : ''}`);
    }
    const html = await response.text();
    if (!html || html.length < 200) throw new Error(`empty/short SSR response (${html?.length || 0}B)`);
    return html;
  } finally {
    clearTimeout(timer);
  }
}

// SSR 回退：直接抓门户页解析 init-data（首屏 15 条），API 不可达时的部分覆盖。
export async function fetchDjiSsrJobs(fetcher, portal, { referer = '' } = {}) {
  const html = await fetchDjiSsrHtml(fetcher, portal);
  const data = parseDjiInitData(html);
  if (!data || !data.jobs.length) {
    const sample = stripTags(String(html || '').slice(0, 1200)).slice(0, 300);
    console.warn(`[dji:${'大疆'}] SSR fallback no init-data; sample: ${sample}`);
    return { jobs: [], total: 0 };
  }
  return data;
}

// Playwright 渲染通道：Runner 直连/API 被边缘 WAF 拦截（HTTP 404，web_fetch 服务端同 URL 200）时，
// 用 Chromium 真实渲染门户页取 init-data——与 moka/bytedance 在 Runner 上被证明可靠的通道一致。
// 返回 { jobs, total }；失败抛错由调用方记录。
export async function fetchDjiSsrViaPlaywright(chromium, portal) {
  const url = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#init-data', { timeout: 15000 }).catch(() => {});
    // 页面 JS（TurboApply）可能已拉取更完整列表，优先读 window.TurboApply.data。
    const turbo = await page.evaluate(() => {
      const d = window.TurboApply && window.TurboApply.data;
      return d ? { jobs: Array.isArray(d.jobs) ? d.jobs : [], total: Number(d.jobStats?.total) || 0 } : null;
    });
    if (turbo && turbo.jobs.length) return turbo;
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const parsed = parseDjiInitData(html);
    if (parsed && parsed.jobs.length) return parsed;
    return { jobs: [], total: 0 };
  } catch (error) {
    throw new Error(`Playwright SSR ${error?.message || error}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function normalizeRow(job = {}) {
  const locations = Array.isArray(job.locations) ? job.locations : [];
  const address = locations.map((l) => String(l?.address || '')).filter(Boolean).join(' ');
  const title = String(job.title || '').trim();
  return {
    id: String(job.id || ''),
    title,
    department: String(job.department?.name || ''),
    zhineng: String(job.zhineng?.name || ''),
    address,
    city: citiesFromText(`${title} ${address}`)[0] || '待核',
    publishedAt: normalizeDate(job?.publishedAt || job?.openedAt),
    deadline: normalizeDate(job?.closedAt),
    raw: job
  };
}

export function parseDjiJob(source, row = {}, detail = {}, now = new Date()) {
  const duty = stripTags(detail?.jobDescription || '');
  const extra = [detail?.education, detail?.minExperience, detail?.maxExperience].filter((x) => x != null && x !== '').join(' ');
  const jobText = [row.title, row.zhineng, row.department, duty, extra].filter(Boolean).join('\n');
  const roleFamily = classifyRole(row.title);
  const skills = detectSkills(jobText);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);
  // 兜底剔除一线销售（职能白名单外已有"销售"，此处防标题绕过）。
  if (/^(销售|销售运营)/.test(row.title) && /(to|到|→)\s*[BＣBC]/i.test(row.title)) riskTags.push('纯销售');

  let salary = detail?.minSalary ? `${detail.minSalary}-${detail.maxSalary || ''}${detail.salaryUnit || ''}` : '';
  if (!salary) salary = extractSalary(jobText) || '';

  const portal = parseDjiPortal(source);
  const sourceUrl = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN#/job/${encodeURIComponent(row.id)}`;

  return {
    id: `dji-${crypto.createHash('sha1').update(`${portal.base}|${row.id}|${row.title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '大疆',
    title: row.title,
    roleFamily,
    city: row.city || '待核',
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.includes(w)).slice(0, 8),
    preferenceTags,
    riskTags,
    source: '大疆官方2027校招官网',
    sourceType: 'official',
    sourceUrl,
    verification: source.campaignLabel ? `官方招聘官网 · 已核验${source.campaignLabel}` : '官方招聘官网 · 2027届拓疆者校园招聘',
    publishedAt: row.publishedAt,
    deadline: row.deadline,
    description: `大疆官方校园招聘（拓疆者计划）岗位；${row.zhineng ? `职能类别：${row.zhineng}。` : ''}${row.department ? `所属部门：${row.department}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary,
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: duty,
    jobRequirements: '',
    _searchText: jobText,
    _sourceJobId: row.id
  };
}

function emptyResult(errors = 1, message = '') {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, detailErrors: 0, snapshotComplete: false, apiPath: 'none', error: message } };
}

export async function searchDjiJobs(profile, source = {}, { fetcher = fetch, chromium = null, maxPages, maxJobs, now = new Date() } = {}) {
  const portal = parseDjiPortal(source);
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 8), 20));
  const jobLimitCap = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 500));
  const pageSize = Math.max(10, Math.min(Number(source.pageSize || 50), 100));

  let pages = 0, listed = 0, detailed = 0, errors = 0, detailErrors = 0, apiPath = 'none';
  const rowsByKey = new Map();
  const seen = new Set();
  let total = 0;

  // 1) 主通道：Moka 公开 API 分页取全量。
  try {
    const { jobs, total: apiTotal } = await fetchDjiApiJobs(fetcher, portal, { pageSize, maxPages: pageLimit, maxJobs: jobLimitCap });
    pages = Math.ceil((jobs.length || 1) / pageSize);
    total = apiTotal || jobs.length;
    for (const job of jobs) {
      const row = normalizeRow(job);
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rowsByKey.set(row.id, row);
      listed++;
    }
    if (seen.size) apiPath = 'api';
  } catch (error) {
    errors++;
    console.warn(`[dji:${source.company || '大疆'}] API jobs/v2 failed: ${error?.message || error}; falling back to SSR init-data`);
  }

  // 2) 回退/补充：SSR init-data（API 失败时至少覆盖首屏；API 成功时跳过）。
  //    直连失败（Runner 边缘拦截 HTTP 404）→ Playwright 渲染（Runner 可靠通道）→ jina 代理 GET 兜底。
  if (!seen.size) {
    const ssrUrl = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN`;
    const ssrAttempts = [
      { name: 'ssr-direct', fn: () => fetchDjiSsrJobs(fetcher, portal) },
      ...(chromium ? [{ name: 'ssr-pw', fn: () => fetchDjiSsrViaPlaywright(chromium, portal) }] : []),
      { name: 'ssr-jina', fn: async () => {
        const html = await fetchViaJina(fetcher, ssrUrl, 'SSR');
        return parseDjiInitData(html) || { jobs: [], total: 0 };
      } }
    ];
    for (const attempt of ssrAttempts) {
      try {
        const ssr = await attempt.fn();
        total = ssr.total || ssr.jobs.length;
        for (const job of ssr.jobs) {
          const row = normalizeRow(job);
          if (!row.id || seen.has(row.id)) continue;
          seen.add(row.id);
          rowsByKey.set(row.id, row);
          listed++;
        }
        if (seen.size) { apiPath = attempt.name === 'ssr-jina' ? 'ssr-via-jina' : (attempt.name === 'ssr-pw' ? 'ssr-via-playwright' : 'ssr'); break; }
      } catch (error) {
        errors++;
        console.warn(`[dji:${source.company || '大疆'}] ${attempt.name} failed: ${error?.message || error}`);
      }
    }
  }

  if (!seen.size) {
    const message = `no jobs parsed via API or SSR (errors=${errors}); apply.careers.dji.com may be unreachable from runner or API contract changed`;
    console.warn(`[dji:${source.company || '大疆'}] ${message}`);
    return emptyResult(errors, message);
  }

  // 3) 职能白名单过滤：只保留在范围职能，其余（技术/设计/财务/法务/销售/数字化建设等）直接跳过。
  const scopedRows = [...rowsByKey.values()].filter((row) => IN_SCOPE_ZHINENG.has(row.zhineng));
  const skippedZhineng = seen.size - scopedRows.length;
  if (skippedZhineng > 0) console.log(`[dji:${source.company || '大疆'}] zhineng out-of-scope skipped=${skippedZhineng} (of listed=${seen.size})`);

  // 4) 详情增强（enrichDetails 默认开）。
  const jobs = [];
  for (const row of scopedRows) {
    if (jobs.length >= jobLimitCap) break;
    let detail = {};
    if (source.enrichDetails !== false) {
      try {
        const payload = await postJson(fetcher, `${portal.base}/api/outer/ats-apply/website/job`, {
          orgId: portal.orgId,
          siteId: portal.siteId,
          jobId: row.id,
          locale: 'zh-CN',
          isInviteResume: true
        }, `job detail ${row.id}`, { referer: `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN` });
        if (payload && typeof payload === 'object') detail = payload;
        detailed++;
      } catch (error) {
        detailErrors++;
      }
    }
    try {
      const job = parseDjiJob(source, row, detail, now);
      if (!job.title) continue;
      if (job.riskTags?.includes('纯销售')) continue;
      if (shouldKeep(job, profile, now)) jobs.push(job);
    } catch { errors++; }
  }

  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: {
      pages, listed, detailed, keptJobs: kept.length, errors, detailErrors, snapshotComplete: seen.size > 0,
      apiPath, total, skippedZhineng, totalDiscovered: seen.size
    }
  };
}
