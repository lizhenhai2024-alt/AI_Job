import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','洞察','招聘'];

function clean(value = '') { return String(value || '').replace(/\s+/g, ' ').trim(); }
function cityFrom(title = '', body = '') {
  const titleCity = CITY_NAMES.find((city) => String(title).includes(city));
  if (titleCity) return titleCity;
  return CITY_NAMES.find((city) => String(body).slice(0, 1800).includes(city)) || '待核';
}

function normalizeHref(base, href) {
  try { return new URL(href, base).href; } catch { return ''; }
}

export function parseEcoflowJob(source, row = {}, now = new Date()) {
  const title = clean(row.title || '');
  const body = clean(row.body || '');
  const url = row.url || source.url;
  const jobText = `${title}\n${body}`;
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const rawId = String((url.match(/position\/(\d+)\/detail/i) || [,''])[1] || crypto.createHash('sha1').update(url).digest('hex').slice(0,12));
  return {
    id: `ecoflow-${rawId}`,
    company: source.company || '正浩创新EcoFlow',
    title,
    roleFamily,
    city: cityFrom(title, body),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: /英语|英文|English|CET|德语|法语|西语|葡语|日语|韩语|俄语|阿语/i.test(jobText) ? ['英语'] : [],
    experienceKeywords: EXPERIENCE_WORDS.filter((word) => jobText.toLowerCase().includes(word.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '正浩创新EcoFlow官方2027校招官网',
    sourceType: 'official',
    sourceUrl: url,
    verification: '官方招聘官网',
    publishedAt: '',
    deadline: '',
    description: `EcoFlow 官方 2027 秋季校园招聘岗位；${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责和最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText
  };
}

async function collectLinks(page, source, maxJobs) {
  await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  const anchors = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href') || '', title: (a.innerText || '').trim() })));
  const html = await page.content();
  const map = new Map();
  for (const item of anchors) {
    if (!/position\/\d+\/detail/i.test(item.href)) continue;
    const url = normalizeHref(source.url, item.href);
    if (url) map.set(url, { url, title: clean(item.title) });
  }
  for (const match of html.matchAll(/(?:https?:\/\/[^"'\s<>]+)?\/[^"'\s<>]*position\/(\d+)\/detail/gi)) {
    const url = normalizeHref(source.url, match[0]);
    if (url && !map.has(url)) map.set(url, { url, title: '' });
  }
  return [...map.values()].slice(0, maxJobs);
}

export async function searchEcoflowJobs(profile, source, { chromium, maxJobs, maxDetails, now = new Date() } = {}) {
  if (!chromium || !source?.url) return { jobs: [], stats: { listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false } };
  const listLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 120), 200));
  const detailLimit = Math.max(1, Math.min(Number(maxDetails || source.maxDetails || listLimit), 200));
  let browser;
  let errors = 0;
  const jobs = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; AI-Job/0.5)' });
    const listPage = await context.newPage();
    const links = await collectLinks(listPage, source, listLimit);
    await listPage.close();

    const detailPage = await context.newPage();
    let detailed = 0;
    for (const item of links.slice(0, detailLimit)) {
      try {
        await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await detailPage.waitForTimeout(500);
        const body = clean(await detailPage.locator('body').innerText({ timeout: 5000 }));
        const title = item.title || clean(await detailPage.locator('h1, h2').first().innerText({ timeout: 2500 }).catch(() => '')) || clean((await detailPage.title()).replace(/[-_|].*$/, ''));
        detailed++;
        const job = parseEcoflowJob(source, { ...item, title, body }, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
    }
    await detailPage.close();
    await context.close();
    const kept = dedupeJobs(jobs);
    return { jobs: kept, stats: { listed: links.length, detailed, keptJobs: kept.length, errors, snapshotComplete: links.length <= detailLimit } };
  } catch {
    errors++;
    return { jobs: [], stats: { listed: 0, detailed: 0, keptJobs: 0, errors, snapshotComplete: false } };
  } finally {
    await browser?.close().catch(() => {});
  }
}
