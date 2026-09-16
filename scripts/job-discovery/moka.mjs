import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

const CARD_TAG_LINE_RX = /^(?:急|热|新|荐|推|置顶|热门|紧急|hot|new)$/i;

function textOf(v = '') { return String(v || '').replace(/\s+/g, ' ').trim(); }
function cityFrom(text = '') { return CITY_NAMES.find((c) => String(text).includes(c)) || '待核'; }
function normalizeMokaDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return '';
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}
function decodeAttr(value = '') {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function mokaJobsUrl(portalUrl = '') {
  const base = String(portalUrl).split('#')[0].replace(/\/$/, '');
  return `${base}#/jobs`;
}

export function mokaJobUrl(portalUrl = '', jobId = '') {
  const base = String(portalUrl).split('#')[0].replace(/\/$/, '');
  return `${base}#/job/${jobId}`;
}

export function parseMokaInitData(html = '') {
  const match = String(html).match(/<input[^>]+id=["']init-data["'][^>]+value=["']([\s\S]*?)["'][^>]*>/i);
  if (!match) return null;
  try { return JSON.parse(decodeAttr(match[1])); } catch { return null; }
}

function cardsFromInitData(initData, source) {
  const jobs = Array.isArray(initData?.jobs) ? initData.jobs : [];
  return jobs.map((job) => {
    const locations = Array.isArray(job?.locations) ? job.locations : [];
    const locationText = locations.map((x) => x?.address || x?.cityName || (x?.country && x.country !== '中国' ? x.country : '') || '').filter(Boolean).join(' ');
    const extra = [job?.department?.name, job?.zhineng?.name, job?.commitment, locationText].filter(Boolean).join(' ');
    return {
      href: mokaJobUrl(source.url, job?.id || ''),
      text: [job?.title, extra].filter(Boolean).join('\n'),
      publishedAt: normalizeMokaDate(job?.publishedAt || job?.openedAt || job?.createdAt),
      deadline: normalizeMokaDate(job?.closedAt)
    };
  }).filter((x) => x.href && x.text && !x.href.endsWith('/job/'));
}

export function explicitMokaCohortYears(text = '') {
  const value = String(text);
  const years = [];
  for (const match of value.matchAll(/(20\d{2})\s*届/g)) years.push(match[1]);
  // "2026管理培训生 / 2026校园招聘 / 2026管培生" style titles omit the 届 character.
  for (const match of value.matchAll(/(20\d{2})\s*(?:届|年)?\s*(?:管理培训生|管培生|校园招聘|校招|秋招|招聘|毕业生)/g)) years.push(match[1]);
  for (const match of value.matchAll(/(?:^|[^0-9])(\d{2})\s*届/g)) {
    const yy = Number(match[1]);
    if (yy >= 20 && yy <= 40) years.push(`20${match[1]}`);
  }
  return [...new Set(years)];
}

export function resolveMokaGraduationYear(text = '', configuredYear = '2027', { strict = false } = {}) {
  const target = String(configuredYear || '');
  if (!target) return '';
  const years = explicitMokaCohortYears(text);
  if (years.length && !years.includes(target)) return '';
  if (strict && !years.includes(target)) return '';
  return target;
}

export function isMokaTitleAllowed(title = '', source = {}) {
  const value = String(title || '');
  if (/实习|兼职|part[- ]?time|\bIntern(?:ship)?\b/i.test(value)) return false;
  const excludes = Array.isArray(source.excludeTitle) ? source.excludeTitle : [];
  return !excludes.some((pattern) => value.includes(String(pattern)));
}

export function resolveMokaCardTitle(lines = []) {
  const cleanLines = lines.map((line) => String(line || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return cleanLines.find((line) => !CARD_TAG_LINE_RX.test(line)) || cleanLines[0] || '';
}

export function parseMokaCard({ company, title, text = '', url, graduationYear = '2027', strictCohort = false, now = new Date(), publishedAt = '', deadline = '' }) {
  const body = `${title}\n${text}`;
  const roleFamily = classifyRole(title);
  const skills = detectSkills(body);
  const experienceKeywords = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'].filter((w) => body.includes(w)).slice(0,8);
  const preferenceTags = [/海外|国际|全球/.test(body) ? '国际业务' : '', /跨文化|本地化|海外用户|海外市场/.test(body) ? '跨文化' : '', /出海|海外市场|跨境/.test(body) ? '出海' : ''].filter(Boolean);
  const years = explicitMokaCohortYears(body);
  const resolvedYear = resolveMokaGraduationYear(body, graduationYear, { strict: strictCohort });
  const verification = resolvedYear
    ? years.includes(String(graduationYear))
      ? '官方招聘官网 · JD/标题明确2027届'
      : '官方招聘官网 · 2027校招源（卡片未单列届别）'
    : years.length
      ? `官方招聘官网 · 届别冲突（${years.join('/')}届）`
      : strictCohort
        ? '官方招聘官网 · 监控源（岗位未出现2027届证据）'
        : '官方招聘官网';
  return {
    id: `moka-${crypto.createHash('sha1').update(url).digest('hex').slice(0,12)}`,
    company, title, roleFamily, city: cityFrom(`${title} ${text}`), graduationYear: resolvedYear,
    skills, languages: /英语|英文|CET|English/i.test(body) ? ['英语'] : [],
    experienceKeywords, preferenceTags, riskTags: detectRisks(body),
    source: '公司官方Moka校招官网', sourceType: 'official', sourceUrl: url,
    verification, publishedAt, deadline,
    description: `公司官方 Moka 校招岗位；${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary: extractSalary(body), status: '推荐', discoveredAt: now.toISOString(),
    jobDescription: text,
    jobRequirements: '',
    _searchText: body
  };
}

export async function searchMokaJobs(profile, sources = [], { chromium, timeoutMs = 45000, now = new Date() } = {}) {
  if (!chromium || !sources.length) return { jobs: [], stats: { portals: sources.length, scannedPortals: 0, discoveredUrls: 0, keptJobs: 0, errors: 0, ssrJobs: 0, domJobs: 0 } };
  const browser = await chromium.launch({ headless: true });
  const jobs = [];
  let scannedPortals = 0, discoveredUrls = 0, errors = 0, ssrJobs = 0, domJobs = 0, cohortRejected = 0, titleRejected = 0;
  const perPortal = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    for (const source of sources) {
      let portalDiscovered = 0, portalKept = 0, portalErrors = 0, portalCohort = 0, portalTitle = 0;
      try {
        // 分页遍历：Moka 列表默认每页约30条，遍历 page=1..N 直到空页（韶音187条=7页）
        const pageCards = new Map();
        for (let pg = 1; pg <= 12; pg++) {
          const jobsUrl = mokaJobsUrl(source.url);
          const sep = jobsUrl.includes('?') ? '&' : '?';
          await page.goto(pg === 1 ? jobsUrl : `${jobsUrl}${sep}page=${pg}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForTimeout(1800);
          let prevCount = -1;
          let stableRounds = 0;
          for (let i = 0; i < 12; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(350);
            const count = await page.evaluate(() => document.querySelectorAll('a[href*="#/job/"], a[href*="/job/"]').length);
            if (count === prevCount) stableRounds++;
            else stableRounds = 0;
            prevCount = count;
            if (stableRounds >= 2 && i >= 2) break;
          }
          const html = await page.content();
          const turboData = await page.evaluate(() => {
            try {
              const d = window.TurboApply && window.TurboApply.data;
              if (!d || !Array.isArray(d.jobs)) return null;
              return { jobs: d.jobs };
            } catch { return null; }
          });
          const initCards = cardsFromInitData(turboData || parseMokaInitData(html), source);
          const domCards = await page.evaluate(() => {
            const anchors = [...document.querySelectorAll('a[href*="#/job/"], a[href*="/job/"]')];
            return anchors.map((a) => {
              const box = a.closest('li, article, [class*="job"], [class*="position"], [class*="card"]') || a.parentElement || a;
              return { href: a.href, text: (box.innerText || a.innerText || a.textContent || '').trim() };
            }).filter((x) => x.href && x.text);
          });
          const pgCards = [...initCards, ...domCards];
          let added = 0;
          for (const card of pgCards) {
            const key = String(card.href).split('#')[1] || card.href;
            if (!pageCards.has(key)) { pageCards.set(key, card); added++; }
          }
          if (added === 0) break; // 空页或重复页停止
        }
        const cards = [...pageCards.values()];
        discoveredUrls += cards.length;
        portalDiscovered += cards.length;

        for (const card of cards) {
          const lines = card.text.split(/\n+/).map(textOf).filter(Boolean);
          const title = resolveMokaCardTitle(lines);
          if (!title) continue;
          if (!isMokaTitleAllowed(title, source)) { titleRejected++; portalTitle++; continue; }
          const job = parseMokaCard({
            company: source.company,
            title,
            text: lines.slice(1).join(' '),
            url: card.href,
            graduationYear: source.graduationYear || profile.graduationYear,
            strictCohort: Boolean(source.strictCohort),
            now,
            publishedAt: card.publishedAt,
            deadline: card.deadline
          });
          if (!job.graduationYear) { cohortRejected++; portalCohort++; continue; }
          if (shouldKeep(job, profile, now)) { jobs.push(job); portalKept++; }
        }
      } catch { errors++; portalErrors++; }
      perPortal[source.company] = { discoveredUrls: portalDiscovered, keptJobs: portalKept, errors: portalErrors, cohortRejected: portalCohort, titleRejected: portalTitle };
    }
  } finally { await browser.close(); }
  // Moka 岗位按唯一 URL(id) 去重：同标题多卡片（如品牌营销管培生多语种方向）是不同投递机会，不可按 title 合并
  const kept = [...new Map(jobs.map((j) => [j.id || j.sourceUrl, j])).values()];
  return { jobs: kept, stats: { portals: sources.length, scannedPortals, discoveredUrls, keptJobs: kept.length, errors, ssrJobs, domJobs, cohortRejected, titleRejected, perPortal } };
}
