import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

// 九号公司 2027 校园招聘专用适配器（zhaopin.ninebot.com Moka 定制域 / 标准域镜像）。
// - 官方入口 zhaopin.ninebot.com/m/campus-recruitment/ninebot/45627（2027届，8月底网申开放）：
//   首页分类 技术研发90/设计23/供应链18/服务11/生产制造12/产品8/营销33/质量20/职能47（合计261岗）。
//   页面为 Moka 系 SPA；定制域供 web_fetch 服务端验证，Runner 直连通道用标准域镜像
//   app.mokahr.com/campus_apply/ninebot/45627（与 dji/143359 同域，Runner 可达）。
// - 标准域结构：分类页 #/jobs?zhineng[0]=<id>（分类 ID：营销200305/职能204241/供应链200304/产品208248/
//   服务206002/质量198306/技术研发204240/设计206001/生产制造208247），岗位卡片 a[href*='#/job/<uuid>']，
//   分页器 .sd-Pagination-* 同 dji；卡片无 JD，详情页 #/job/<uuid> 内"职位描述"段为完整 JD，
//   "职位性质"（全职/实习）与"项目类型"（校招生/九号星/实习）可过滤实习。
// - Moka 公开 API jobs/v2 返回 AES 加密 payload（同大疆定制域），不做 API 通道；详情走 SPA hash 切换。
// - 范围策略（用户硬约束 + AI_Job 生产池规则）：
//   * 只抓目标分类（zhinengId 白名单）：营销/职能/供应链/产品/服务/质量；技术研发/设计/生产制造不抓。
//   * 实习过滤：职位性质 != 全职、或项目类型含"实习"、或标题含"实习"→ 剔除（2027 校招生/九号星保留）。
//   * 纯销售剔除：标题以"销售"开头的一线销售（门店/区域销售）不抓；GTM/营销/运营等保留。
const STANDARD_PORTAL_BASE = 'https://app.mokahr.com';
const CARD_LINK_SEL = "a[href*='#/job/']";
const CARD_TITLE_SEL = "[class*='title-']";
const CARD_INFO_SEL = "[class*='Ellipsis-hiddenContent']";

// 九号分类 ID（zhaopin.ninebot.com 分类页实测）。目标白名单不含技术研发/设计/生产制造；
// 质量类（198306）实测 20 岗全为"助理XX工程师"（可靠性测试/制程质量/软件测试/供应商质量等工程测试属性），
// 与大疆策略一致不抓取；职能类/服务类内部财务法务/IT运维/技术支持工程岗在 parse 层剔除。
const ZHINENG_BY_ID = {
  '200305': '营销类',
  '204241': '职能类',
  '200304': '供应链类',
  '208248': '产品类',
  '206002': '服务类'
};

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

export function parseNinebotPortal(source = {}) {
  const url = String(source.url || `https://zhaopin.ninebot.com/m/campus-recruitment/ninebot/45627`).split('#')[0].replace(/\/$/, '');
  const m = url.match(/\/campus-recruitment\/([^/]+)\/(\d+)/);
  return {
    base: 'https://app.mokahr.com',
    orgId: m?.[1] || 'ninebot',
    siteId: m?.[2] || '45627'
  };
}

// 标准域 Playwright 通道：逐目标分类导航列表页抓卡片（含分页），再 SPA hash 切换详情页提取 JD/性质/项目。
export async function fetchNinebotStandardViaPlaywright(chromium, portal, { maxJobs = 300 } = {}) {
  const base = `${STANDARD_PORTAL_BASE}/campus_apply/${portal.orgId}/${portal.siteId}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ locale: 'zh-CN' });
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });
    page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err).slice(0, 160)));

    const jobs = [];
    const seenIds = new Set();
    let zhinengSeen = 0;

    const grabCards = async () => {
      return page.evaluate((sels) => {
        const out = [];
        document.querySelectorAll(sels.link).forEach((a) => {
          const id = String(a.getAttribute('href') || '').replace('#/job/', '');
          const title = (a.querySelector(sels.title)?.textContent || '').trim();
          const info = [...a.querySelectorAll(sels.info)].map((x) => (x.textContent || '').trim()).filter(Boolean);
          if (id && title) out.push({ id, title, nature: info[0] || '', location: info[1] || '' });
        });
        return out;
      }, { link: CARD_LINK_SEL, title: CARD_TITLE_SEL, info: CARD_INFO_SEL });
    };

    const fetchDetail = async (id) => {
      await page.evaluate((jobId) => { location.hash = `#/job/${jobId}`; }, id);
      await page.waitForFunction((jobId) => {
        const t = document.body ? document.body.innerText : '';
        return t.includes('职位描述') && t.includes('职位信息');
      }, id, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      return page.evaluate((jobId) => {
        const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim();
        const descIdx = t.indexOf('职位描述');
        const infoIdx = t.indexOf('职位信息');
        let jd = '';
        if (descIdx >= 0) jd = (infoIdx > descIdx ? t.slice(descIdx, infoIdx) : t.slice(descIdx)).replace(/^职位描述\s*/, '').trim();
        const proj = t.match(/项目类型\s*项目类型\s*(\S+)/);
        const prop = t.match(/职位性质\s*职位性质\s*(\S+)/);
        return {
          id: jobId,
          jd,
          project: proj?.[1] || '',
          nature: prop?.[1] || ''
        };
      }, id);
    };

    for (const [zhinengId, zhinengName] of Object.entries(ZHINENG_BY_ID)) {
      if (jobs.length >= maxJobs) break;
      const listUrl = `${base}#/jobs?zhineng%5B0%5D=${zhinengId}`;
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector(CARD_LINK_SEL, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);

      let cards = await grabCards();
      if (!cards.length) {
        console.warn(`[ninebot:九号公司] zhineng ${zhinengName} cards empty url=${page.url()}`);
        continue;
      }
      // 分页：与 dji 同款 Moka 分页器，点击后续页直到没有更多或达到上限。
      for (let p = 2; p <= 6; p++) {
        const clicked = await page.evaluate((pg) => {
          const btns = [...document.querySelectorAll(".sd-Pagination-ul-9jXKq button, .sd-Pagination-item-4J_pS")];
          const target = btns.find((b) => (b.textContent || '').trim() === String(pg));
          if (target) { target.click(); return true; }
          return false;
        }, p);
        if (!clicked) break;
        await page.waitForFunction((pg) => {
          const active = document.querySelector('.sd-Pagination-item-4J_pS.sd-Pagination-is-active-1EFsg');
          return active && (active.textContent || '').trim() === String(pg);
        }, p, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const next = await grabCards();
        if (!next.length) break;
        cards = cards.concat(next);
        if (cards.length >= 200) break;
      }

      // 逐岗详情（SPA hash 切换，无需重新加载页面）。
      for (const card of cards) {
        if (jobs.length >= maxJobs) break;
        if (seenIds.has(card.id)) continue;
        // 列表卡片标题含"实习"直接剔除（双保险之一，详情页仍会复核）。
        if (/实习/i.test(card.title)) continue;
        const detail = await fetchDetail(card.id);
        // 实习过滤：职位性质非全职、项目类型含"实习"、详情标题含"实习"任一命中即剔除。
        if (detail.nature && detail.nature !== '全职') continue;
        if (/实习/i.test(detail.project)) continue;
        if (/实习/i.test(detail.jd.slice(0, 80))) continue;
        seenIds.add(card.id);
        jobs.push({
          id: card.id,
          title: card.title,
          zhineng: { name: zhinengName },
          locations: card.location ? [{ address: card.location }] : [],
          jobDescription: detail.jd || '',
          projectName: detail.project || '',
          publishedAt: ''
        });
        zhinengSeen++;
      }
      console.log(`[ninebot:九号公司] zhineng ${zhinengName} listed=${cards.length} kept=${jobs.length}`);
    }

    if (!jobs.length) {
      throw new Error(`standard portal parsed 0 jobs url=${base} consoleErrors=${consoleErrors.join(' | ') || 'none'}`);
    }
    return { jobs, total: jobs.length };
  } catch (error) {
    throw new Error(`Standard-portal Playwright ${error?.message || error}`);
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
    projectName: String(job?.projectName || ''),
    raw: job
  };
}

export function parseNinebotJob(source, row = {}, detail = {}, now = new Date()) {
  const duty = stripTags(detail?.jobDescription || row.raw?.jobDescription || '');
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
  // 兜底剔除一线销售：标题含"销售"的门店/区域/海外销售与技术销售（营销类含"销售专员/助理销售工程师/海外销售专员"等）。
  if (/销售/.test(row.title)) riskTags.push('纯销售');
  // 职能类内嵌财务/法务/金融/IT运维工程岗剔除（招聘/HR/行政/项目/政府事务/企业文化等保留）。
  if (/会计|财务|财经|税务|审计|资金|法律|法务|投资|证券|银行|成本专员|预算|经分/.test(row.title)) riskTags.push('财务法务');
  if (/IT|运维|开发工程师|测试工程师/.test(row.title)) riskTags.push('技术工程');
  // 服务类技术支持工程岗（助理客户支持工程师等）剔除。
  if (/客户支持工程师|技术支持/.test(row.title)) riskTags.push('技术工程');

  let salary = detail?.minSalary ? `${detail.minSalary}-${detail.maxSalary || ''}${detail.salaryUnit || ''}` : '';
  if (!salary) salary = extractSalary(jobText) || '';

  const portal = parseNinebotPortal(source);
  const sourceUrl = `${portal.base}/campus-recruitment/${portal.orgId}/${portal.siteId}?locale=zh-CN#/job/${encodeURIComponent(row.id)}`;

  return {
    id: `ninebot-${crypto.createHash('sha1').update(`${portal.base}|${row.id}|${row.title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '九号公司',
    title: row.title,
    roleFamily,
    city: row.city || '待核',
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.includes(w)).slice(0, 8),
    preferenceTags,
    riskTags,
    source: '九号公司官方2027校招官网',
    sourceType: 'official',
    sourceUrl,
    verification: source.campaignLabel ? `官方招聘官网 · 已核验${source.campaignLabel}` : '官方招聘官网 · 2027届校园招聘',
    publishedAt: row.publishedAt,
    deadline: row.deadline,
    description: `九号公司官方校园招聘岗位；${row.zhineng ? `职能类别：${row.zhineng}。` : ''}${row.projectName ? `项目类型：${row.projectName}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
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

export async function searchNinebotJobs(profile, source = {}, { fetcher = fetch, chromium = null, maxJobs, now = new Date() } = {}) {
  const portal = parseNinebotPortal(source);
  const jobLimitCap = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 500));
  let listed = 0, detailed = 0, errors = 0, apiPath = 'none';

  const rowsByKey = new Map();
  const seen = new Set();
  let total = 0;

  // 主通道：标准域 Playwright 分类+详情抓取。
  if (chromium) {
    try {
      const std = await fetchNinebotStandardViaPlaywright(chromium, portal, { maxJobs: jobLimitCap });
      total = std.total || std.jobs.length;
      for (const job of std.jobs) {
        const row = normalizeRow(job);
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rowsByKey.set(row.id, row);
        listed++;
      }
      if (seen.size) apiPath = 'standard-portal-via-playwright';
    } catch (error) {
      errors++;
      console.warn(`[ninebot:${source.company || '九号公司'}] standard-portal Playwright failed: ${error?.message || error}`);
    }
  } else {
    console.warn(`[ninebot:${source.company || '九号公司'}] chromium not provided; ninebot adapter requires Playwright channel`);
  }

  if (!seen.size) {
    const message = `no jobs parsed via standard portal (errors=${errors}); ninebot standard portal may be unreachable from runner or contract changed`;
    console.warn(`[ninebot:${source.company || '九号公司'}] ${message}`);
    return emptyResult(errors, message);
  }

  // 生产池规则由 filter-official-live-jobs.mjs 复核；这里只做适配器级剔除（纯销售已在 parse 阶段）。
  const jobs = [];
  for (const row of rowsByKey.values()) {
    if (jobs.length >= jobLimitCap) break;
    try {
      const job = parseNinebotJob(source, row, row.raw, now);
      if (!job.title) continue;
      if (job.riskTags?.includes('纯销售') || job.riskTags?.includes('财务法务') || job.riskTags?.includes('技术工程')) continue;
      if (shouldKeep(job, profile, now)) jobs.push(job);
    } catch { errors++; }
  }

  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: {
      pages: 1, listed, detailed, keptJobs: kept.length, errors, detailErrors: 0,
      snapshotComplete: seen.size > 0, apiPath, total, skippedZhineng: 0, totalDiscovered: seen.size
    }
  };
}
