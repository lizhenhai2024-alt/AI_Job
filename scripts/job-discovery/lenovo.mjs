import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

// 联想中国校园招聘门户（talent.lenovo.com.cn）专用适配器。
// - 站点为自研 SPA：列表页 SSR 渲染岗位卡片，详情页 /position/detail?id=N 服务端直出完整 JD。
// - projectType=1 = 应届生招聘（2027届）；projectType=3 = 人才项目（管培生 Future Leaders / AI专项）。
// - 列表页按 jobTypeName（细分类别）筛选时每个类别岗位数均 ≤10，SSR 全量渲染，逐类别枚举可覆盖全部在范围岗位。
//
// 范围策略（用户硬约束 + AI_Job 生产池规则）：
//   * 只抓取在范围类别：营销/销售/战略/商务商业/人力资源/产品策划/产品运营/项目与方案/供应链管理/供应链工程；
//     技术（软件/硬件/AI/测试/数据/安全等）、设计、财务、法务类不抓取（生产池范围外，下游 isOutOfScopeProfessionalRole 兜底）。
//   * 适配器内再剔除纯销售岗（联想“销售-to B/C 方向”为一线销售，与 meituan 适配器口径一致）。
//   * 实习/非2027届由 shouldKeep 统一拦截。
const BASE = 'https://talent.lenovo.com.cn';
// core.mjs 的 CITY_NAMES 未覆盖无锡/南昌/郑州/哈尔滨/济南/海口等城市，联想岗位分布广，这里扩展。
const CAMPUS_CITIES = [...CITY_NAMES, '无锡', '南昌', '郑州', '哈尔滨', '济南', '海口', '青岛', '大连', '沈阳', '福州', '宁波', '合肥', '石家庄', '太原', '贵阳', '昆明', '长春', '南宁', '兰州', '徐州', '常州', '南通', '烟台', '潍坊'];
const CAMPUS_CITIES_SET = new Set(CAMPUS_CITIES);
const CAMPUS_CATEGORIES = [
  '营销类', '销售类', '战略类', '商务商业类', '人力资源类',
  '产品策划类', '产品运营类', '项目与方案类', '供应链管理类', '供应链工程技术类'
];

const EXPERIENCE_WORDS = ['海外', '运营', '内容', '项目', '市场', '电商', '用户', '数据', '跨文化', '营销', '品牌', '供应链', '客户', '产品', '人力资源', '招聘', '商务'];
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
  const m = String(value || '').match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  if (!m) return '';
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function languagesFrom(text = '') {
  return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n);
}

function citiesFromText(text = '') {
  const found = CAMPUS_CITIES.filter((city) => text.includes(city));
  return found.length ? [...new Set(found)] : [];
}

// 岗位卡片标题可能带“急招”角标（SSR 文本会拼进标题，如“质量管理急招”）。
function cleanTitle(value = '') {
  return String(value || '').replace(/\s*急招\s*$/i, '').trim();
}

// 从列表页解析岗位卡片。
// 结构（去标签后，两种 SSR 版式均已观察到）：
//   岗位名[急招]
//   应届生招聘|类别类|部门A,部门B        （富版式，分隔符为 |）
//   应届生招聘类别类部门A,部门B          （简版式，无分隔符）
//    工作地点：北京,天津
export function parseLenovoListHtml(source, html = '') {
  const jobs = [];
  const seen = new Set();
  const anchors = [...String(html).matchAll(/href=["']([^"']*\/position\/detail[^"']*)["']/gi)];

  for (const [index, match] of anchors.entries()) {
    const href = String(match[1]).replace(/&amp;/gi, '&');
    const idM = href.match(/[?&]id=(\d+)/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;

    // 卡片块边界：优先取包裹锚点的 <li>…</li>；没有 <li> 时退化为“本锚点到下一个详情锚点之间”的切片。
    // （不能用固定大窗口：窗口会跨卡，导致后卡标题取成前卡的。）
    let blockStart = html.lastIndexOf('<li', match.index);
    let blockEnd = html.indexOf('</li>', match.index);
    let ctx;
    if (blockStart >= 0 && blockEnd > match.index && blockEnd - blockStart < 3000) {
      ctx = stripTags(html.slice(blockStart, blockEnd));
    } else {
      const nextAnchor = anchors[index + 1];
      const ctxStart = Math.max(0, match.index - 300);
      const ctxEnd = nextAnchor ? Math.min(html.length, nextAnchor.index) : Math.min(html.length, match.index + href.length + 900);
      ctx = stripTags(html.slice(ctxStart, ctxEnd));
    }

    const lines = ctx.split('\n').map((x) => x.trim()).filter(Boolean);
    const recruitIdx = lines.findIndex((line) => line.includes('应届生招聘'));
    // 标题 = “应届生招聘”行前面最近的一行（同卡内）。
    let title = cleanTitle(recruitIdx > 0 ? lines[recruitIdx - 1] : '');
    if (!title) {
      // 兜底：块内第一个不含“应届生/工作地点/急招/筛选/共N个岗位”的行
      title = cleanTitle(lines.find((line) => !/应届生招聘|工作地点|急招|筛选|共\d+个岗位/.test(line)) || '');
    }
    if (!title || seen.has(id)) continue;
    seen.add(id);

    const recruitLine = recruitIdx >= 0 ? lines[recruitIdx] : '';
    // 类别名必须以行首（剥掉“应届生招聘”与分隔符后）开头，避免把前缀/部门名误并进类别。
    // 例：简版式“应届生招聘营销类Marketing” → “营销类”；富版式“应届生招聘|营销类|Marketing” → “营销类”。
    const strippedRecruit = recruitLine.replace(/^应届生招聘\s*/, '').replace(/^[|\s]*/, '');
    const categoryM = strippedRecruit.match(/^([\u4e00-\u9fa5A-Za-z]{2,12}类)/);
    const category = categoryM ? categoryM[1] : '';
    // 部门：类别名之后、分隔符之后的内容，且在“工作地点”前截断（简版式部门与地点可能同行）。
    const deptPart = category
      ? strippedRecruit.slice(category.length).replace(/^[|\s]*/, '').split(/工作地点[：:]?/)[0].replace(/[|\s]*$/, '')
      : strippedRecruit.split(/工作地点[：:]?/)[0];
    const cityLine = lines.find((line) => /工作地点[：:]/.test(line)) || '';
    const citiesRaw = (cityLine.match(/工作地点[：:]\s*(.+)$/) || [,''])[1];
    const locations = citiesRaw ? citiesFromText(citiesRaw) : [];
    if (/全国/.test(citiesRaw)) locations.push('全国');
    if (/国外|海外/.test(citiesRaw) && !locations.includes('国外')) locations.push('国外');

    const detailUrl = new URL(href, BASE).href;
    jobs.push({ id, title, category, department: deptPart, locations, detailUrl });
  }
  return jobs;
}

// 详情页解析：/position/detail?id=N 服务端直出。
// 结构（去标签后）：
//   岗位名
//   应届生招聘
//   类别类
//   所属部门：A,B
//   城市列表
//   岗位职责
//   {职责}
//   任职要求
//   {要求}
//   工作地点
//   {城市}
export function parseLenovoDetailHtml(html = '') {
  const text = stripTags(html);
  const out = { duty: '', require: '', salary: '', address: '' };
  const dutyIdx = text.indexOf('岗位职责');
  const requireIdx = text.indexOf('任职要求');
  const placeIdx = text.indexOf('工作地点');
  const endIdx = text.indexOf('立即申请', 0);
  const end = endIdx > 0 ? endIdx : text.length;

  if (dutyIdx >= 0) {
    const from = dutyIdx + '岗位职责'.length;
    const to = requireIdx > from ? requireIdx : end;
    out.duty = text.slice(from, to).replace(/^[\s\n]+|[\s\n]+$/g, '').trim();
  }
  if (requireIdx >= 0) {
    const from = requireIdx + '任职要求'.length;
    const to = placeIdx > from ? placeIdx : end;
    out.require = text.slice(from, to).replace(/^[\s\n]+|[\s\n]+$/g, '').trim();
  }
  if (placeIdx >= 0 && placeIdx < end) {
    out.address = text.slice(placeIdx + '工作地点'.length, end).replace(/^[\s\n]+|[\s\n]+$/g, '').trim();
  }
  const salaryCtx = text.slice(Math.max(0, dutyIdx >= 0 ? dutyIdx : 0), Math.min(text.length, (dutyIdx >= 0 ? dutyIdx : 0) + 4000));
  out.salary = extractSalary(salaryCtx) || '';
  return out;
}

export function parseLenovoJob(source, row = {}, detail = {}, now = new Date()) {
  const jobText = [row.title, row.category, row.department, detail.duty, detail.require].filter(Boolean).join('\n');
  const roleFamily = classifyRole(row.title);
  const skills = detectSkills(jobText);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);
  // 联想“销售-to B/C 方向”为一线销售岗，直接打纯销售风险标签，由适配器在入库前剔除。
  // 注意：/^销售(?:-|to)?\s*[BＣBC]/ 会把“销售-to B”误配失败（- 与 to 竞争），必须用 -?to 组合。
  if (/^销售(?:[-—]?\s*to|到|→)\s*[BＣBC]/i.test(row.title)) riskTags.push('纯销售');

  const locations = Array.isArray(row.locations) ? row.locations : [];
  const city = locations.find((c) => CAMPUS_CITIES_SET.has(c)) || (locations.includes('全国') ? '全国' : locations.join('、') || '待核');
  const detailUrl = row.detailUrl || `${BASE}/position/detail?id=${encodeURIComponent(row.id)}`;

  return {
    id: `lenovo-${crypto.createHash('sha1').update(`${BASE}|${row.id}|${row.title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '联想',
    title: row.title,
    roleFamily,
    city,
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.includes(w)).slice(0, 8),
    preferenceTags,
    riskTags,
    source: '联想官方2027校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl,
    verification: source.campaignLabel ? `官方招聘官网 · 已核验${source.campaignLabel}` : '官方招聘官网 · 2027应届生校招源',
    publishedAt: '',
    deadline: '',
    description: `联想官方校园招聘（应届生）岗位；${row.category ? `类别：${row.category}。` : ''}${row.department ? `部门：${row.department}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: detail.salary || '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: detail.duty,
    jobRequirements: detail.require,
    _searchText: jobText,
    _sourceJobId: row.id
  };
}

function emptyResult(errors = 1, message = '') {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, detailErrors: 0, snapshotComplete: false, error: message } };
}

async function fetchText(fetcher, url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: {
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
        'sec-fetch-user': '?1',
        referer: `${BASE}/campus`
      },
      signal: controller.signal
    });
    if (!response.ok) {
      let sample = '';
      try { sample = (await response.text()).slice(0, 200).replace(/\s+/g, ' '); } catch {}
      throw new Error(`HTTP ${response.status} ${label}${sample ? ` body=${sample}` : ''}`);
    }
    const raw = await response.text();
    if (!raw || raw.length < 200) throw new Error(`empty/short response (${raw?.length || 0}B) ${label}`);
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

// jina 代理 GET：Runner 直连联想（.cn 国内站，Geo/WAF 拦截返回 404）失败时的回退通道。
async function fetchTextViaJina(fetcher, url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetcher(`https://r.jina.ai/${url}`, {
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

// Playwright 渲染通道：Runner 直连联想（.cn 国内站，Geo/WAF 拦截返回 404）失败时，
// 用 Chromium 真实渲染列表页取 SSR 岗位卡片——与 moka/bytedance 在 Runner 上被证明可靠的通道一致。
async function fetchTextViaPlaywright(chromium, url, label) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const diag = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyLen: document.body ? document.body.innerHTML.length : 0,
      detailHrefs: (document.documentElement.outerHTML.match(/position\/detail/g) || []).length,
      bodyStart: (document.body ? document.body.innerHTML.slice(0, 200) : '')
    }));
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    if (!html || html.length < 200) throw new Error(`empty/short playwright response (${html?.length || 0}B) ${label}`);
    if (diag.detailHrefs === 0 && !html.includes('应届生招聘')) {
      throw new Error(`playwright render likely blocked url=${diag.url} title=${diag.title} bodyLen=${diag.bodyLen} bodyStart=${diag.bodyStart.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
    return html;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// 带回退的抓取：直连失败（HTTP 404/超时）或直连 200 但 verify(html) 为 false（空壳/挑战页）时，
// → Playwright 渲染 → jina 代理，并记录失败路径便于线上诊断。
async function fetchTextWithFallback(fetcher, url, label, chromium = null, verify = null) {
  try {
    const html = await fetchText(fetcher, url, label);
    if (!verify || verify(html)) return html;
    throw new Error(`direct 200 but no job cards (${html.length}B) ${label}`);
  } catch (directError) {
    if (chromium) {
      try {
        const viaPw = await fetchTextViaPlaywright(chromium, url, label);
        if (!verify || verify(viaPw)) {
          console.warn(`[lenovo] ${label}: direct(${directError?.message || directError}) -> playwright ok`);
          return viaPw;
        }
        throw new Error(`playwright render ok but no job cards ${label}`);
      } catch (pwError) {
        console.warn(`[lenovo] ${label}: playwright failed (${pwError?.message || pwError})`);
      }
    }
    try {
      const viaJina = await fetchTextViaJina(fetcher, url, label);
      if (!verify || verify(viaJina)) {
        console.warn(`[lenovo] ${label}: direct(${directError?.message || directError}) -> jina ok`);
        return viaJina;
      }
      throw new Error(`jina render ok but no job cards ${label}`);
    } catch (jinaError) {
      throw new Error(`${label}: direct(${directError?.message || directError}) playwright(${chromium ? 'failed' : 'n/a'}) jina(${jinaError?.message || jinaError})`);
    }
  }
}

function logStructureSample(source, html, label) {
  const hrefCount = (String(html).match(/position\/detail/g) || []).length;
  const recruitCount = (String(html).match(/应届生招聘/g) || []).length;
  const sample = cleanText(String(html || '').slice(0, 1500)).split('\n').filter((x) => x.trim()).slice(0, 25).join('\n');
  console.warn(`[lenovo:${source.company}] ${label}: hrefs=${hrefCount} recruitLines=${recruitCount} sample:\n${sample}`);
}

export async function searchLenovoJobs(profile, source = {}, { fetcher = fetch, chromium = null, maxPages, maxJobs, now = new Date() } = {}) {
  const baseUrl = String(source.baseUrl || BASE).replace(/\/$/, '');
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 20), 40));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 200), 400));

  let pages = 0, listed = 0, detailed = 0, errors = 0, detailErrors = 0, snapshotComplete = false;
  const rowsByKey = new Map();
  const seen = new Set();

  try {
    const verifyList = (html) => parseLenovoListHtml(source, html).length > 0;
    // 1) 未筛选总览页：拿“共N个岗位”总数 + 首屏卡片（兜底捕捉任何未枚举到的在范围岗位）。
    const overview = await fetchTextWithFallback(fetcher, `${baseUrl}/position?projectType=1`, 'overview', chromium, verifyList);
    pages++;
    for (const row of parseLenovoListHtml(source, overview)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id); listed++;
      rowsByKey.set(row.id, row);
    }

    // 2) 逐类别枚举（每个类别 ≤10 岗，SSR 全量渲染，覆盖完整在范围岗位）。
    for (const category of CAMPUS_CATEGORIES) {
      if (pages >= pageLimit || seen.size >= jobLimit) break;
      let html;
      try {
        html = await fetchTextWithFallback(fetcher, `${baseUrl}/position?projectType=1&jobTypeName=${encodeURIComponent(category)}`, `category:${category}`, chromium, verifyList);
        pages++;
      } catch (error) {
        errors++;
        continue;
      }
      const rows = parseLenovoListHtml(source, html);
      if (!rows.length) logStructureSample(source, html, `category:${category} no-job-card`);
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id); listed++;
        rowsByKey.set(row.id, row);
      }
    }
    snapshotComplete = true;
  } catch (error) {
    errors++;
    snapshotComplete = false;
  }

  if (!seen.size) {
    const message = `no job cards parsed (errors=${errors}); site may be unreachable from runner or SSR structure changed`;
    console.warn(`[lenovo:${source.company}] ${message}`);
    return emptyResult(errors, message);
  }

  const jobs = [];
  const rawRows = [...rowsByKey.values()];
  for (const row of rawRows) {
    if (jobs.length >= jobLimit) break;
    let detail = {};
    if (source.enrichDetails !== false) {
      try {
        const detailHtml = await fetchTextWithFallback(fetcher, row.detailUrl, `detail:${row.id}`, chromium);
        detail = parseLenovoDetailHtml(detailHtml);
        detailed++;
      } catch (error) {
        detailErrors++;
      }
    }
    try {
      const job = parseLenovoJob(source, row, detail, now);
      if (!job.title) continue;
      // 纯销售（联想“销售-to B/C 方向”）在适配器内直接剔除；其余范围判断交给生产池。
      if (job.riskTags?.includes('纯销售')) continue;
      if (shouldKeep(job, profile, now)) jobs.push(job);
    } catch { errors++; }
  }

  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: { pages, listed, detailed, keptJobs: kept.length, errors, detailErrors, snapshotComplete }
  };
}
