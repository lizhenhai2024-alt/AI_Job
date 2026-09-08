import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

function textOf(v = '') { return String(v || '').replace(/\s+/g, ' ').trim(); }
function cityFrom(text = '') { return CITY_NAMES.find((c) => String(text).includes(c)) || '待核'; }

export function parseMokaCard({ company, title, text = '', url, graduationYear = '2027', now = new Date() }) {
  const body = `${title}\n${text}`;
  const roleFamily = classifyRole(title);
  const skills = detectSkills(body);
  const experienceKeywords = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'].filter((w) => body.includes(w)).slice(0,8);
  const preferenceTags = [/海外|国际|全球/.test(body) ? '国际业务' : '', /跨文化|本地化|海外用户|海外市场/.test(body) ? '跨文化' : '', /出海|海外市场|跨境/.test(body) ? '出海' : ''].filter(Boolean);
  return {
    id: `moka-${crypto.createHash('sha1').update(url).digest('hex').slice(0,12)}`,
    company, title, roleFamily, city: cityFrom(`${title} ${text}`), graduationYear,
    skills, languages: /英语|英文|CET|English/i.test(body) ? ['英语'] : [],
    experienceKeywords, preferenceTags, riskTags: detectRisks(body),
    source: '公司官方Moka校招官网', sourceType: 'official', sourceUrl: url,
    verification: '官方招聘官网', publishedAt: '', deadline: '',
    description: `公司官方 Moka 校招岗位；${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary: '', status: '推荐', discoveredAt: now.toISOString(), _searchText: body
  };
}

export async function searchMokaJobs(profile, sources = [], { chromium, timeoutMs = 45000, now = new Date() } = {}) {
  if (!chromium || !sources.length) return { jobs: [], stats: { portals: sources.length, scannedPortals: 0, discoveredUrls: 0, keptJobs: 0, errors: 0 } };
  const browser = await chromium.launch({ headless: true });
  const jobs = [];
  let scannedPortals = 0, discoveredUrls = 0, errors = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    for (const source of sources) {
      try {
        await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForTimeout(3500);
        scannedPortals++;
        const cards = await page.evaluate(() => {
          const anchors = [...document.querySelectorAll('a[href*="#/job/"], a[href*="/job/"]')];
          return anchors.map((a) => ({ href: a.href, text: (a.innerText || a.textContent || '').trim() }))
            .filter((x) => x.href && x.text)
            .filter((x, i, arr) => arr.findIndex((y) => y.href === x.href) === i);
        });
        discoveredUrls += cards.length;
        for (const card of cards) {
          const lines = card.text.split(/\n+/).map(textOf).filter(Boolean);
          const title = lines[0] || '';
          if (!title) continue;
          const job = parseMokaCard({ company: source.company, title, text: lines.slice(1).join(' '), url: card.href, graduationYear: source.graduationYear || profile.graduationYear, now });
          if (shouldKeep(job, profile, now)) jobs.push(job);
        }
      } catch { errors++; }
    }
  } finally { await browser.close(); }
  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { portals: sources.length, scannedPortals, discoveredUrls, keptJobs: kept.length, errors } };
}
