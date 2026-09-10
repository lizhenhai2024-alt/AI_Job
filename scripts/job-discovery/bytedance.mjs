import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','公关','传播'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function nestedName(value) {
  if (!value) return '';
  if (typeof value === 'string') return clean(value);
  return clean(value.zh_cn || value.name || value.en_us || '');
}
function cityFrom(row = {}) {
  const direct = nestedName(row?.city_info);
  const list = Array.isArray(row?.city_list) ? row.city_list.map(nestedName) : [];
  const raw = [direct, ...list].filter(Boolean).join('、');
  const title = clean(row.title || '');
  return CITY_NAMES.find((c) => title.includes(c)) || CITY_NAMES.find((c) => raw.includes(c)) || raw || '待核';
}
function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }
function publishedAt(row = {}) {
  const ts = Number(row.publish_time || 0);
  if (!ts) return '';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function isIntern(row = {}) {
  const rt = nestedName(row?.recruit_type);
  const subject = typeof row?.job_subject === 'object' ? nestedName(row?.job_subject?.name) : clean(row?.job_subject || '');
  return /实习/.test(rt) || /实习/.test(subject) || /实习生|【实习】/.test(clean(row?.title || ''));
}

export function parseBytedanceJob(source, row = {}, now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.title || '');
  const descriptionText = clean(row.description || '');
  const requirementText = clean(row.requirement || '');
  const category = nestedName(row?.job_category) || nestedName(row?.job_function);
  const recruitType = nestedName(row?.recruit_type);
  const jobText = [title, category, recruitType, descriptionText, requirementText].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global|TikTok|国际化/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `bytedance-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '字节跳动',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '字节跳动官方2027校招官网',
    sourceType: 'official',
    sourceUrl: source.url || 'https://jobs.bytedance.com/campus',
    verification: '官方招聘官网/API',
    publishedAt: publishedAt(row),
    deadline: '',
    description: `字节跳动官方校园招聘岗位；${category ? `职类：${category}。` : ''}${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方校招页确认最新状态。`,    jobDescription: descriptionText || '',
    jobRequirements: requirementText || '',

    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText,
    _sourceJobId: rawId,
    _recruitType: recruitType
  };
}

// ByteDance's campus feed is protected by a per-request `_signature` that the site's
// anti-bot SDK injects into its own HTTP client. A raw Node fetch (even replaying the
// browser cookies) silently falls back to the experienced-hire feed, so we drive the
// real SPA with Playwright and intercept the signed /api/v1/search/job/posts responses.
export async function searchBytedanceJobs(profile, source, { maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  const empty = () => ({ jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false } });
  if (!source?.url) return empty();

  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 20), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 40), 80));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  const timeoutMs = 15000;

  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const jobs = [];
  const seen = new Set();
  let rows = [];

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch { return { ...empty(), degraded: true, reason: 'playwright-unavailable' }; }

  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true, 
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch (e) {
    return { ...empty(), degraded: true, reason: `launch-failed:${e?.message || e}` };
  }

  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    });
    const page = await ctx.newPage();
    const responded = new WeakSet();
    page.on('response', async (resp) => {
      if (!/\/api\/v1\/search\/job\/posts/.test(resp.url()) || resp.status() !== 200) return;
      if (responded.has(resp)) return;
      responded.add(resp);
      try {
        const payload = await resp.json();
        const list = Array.isArray(payload?.data?.job_post_list) ? payload.data.job_post_list : [];
        for (const row of list) {
          const id = String(row?.id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          rows.push(row);
        }
        listed += list.length;
      } catch { /* response body already consumed or non-JSON: ignore */ }
    });

    for (let cur = 1; cur <= pageLimit && rows.length < jobLimit; cur++) {
      const listUrl = `${source.url.replace(/\/$/, '')}/position?keywords=&current=${cur}&limit=${size}`;
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(3500);
      pages++;
      if (rows.length >= jobLimit) break;
    }
    snapshotComplete = rows.length >= jobLimit ? false : true;
  } catch {
    errors++;
  } finally {
    await browser.close().catch(() => {});
  }

  for (const row of rows.slice(0, jobLimit)) {
    if (isIntern(row)) continue;
    try {
      const job = parseBytedanceJob(source, row, now);
      if (!job.title || job.riskTags?.includes('纯销售')) continue;
      if (shouldKeep(job, profile, now)) jobs.push(job);
    } catch { errors++; }
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: rows.length, keptJobs: kept.length, errors, snapshotComplete } };
}
