// 智联招聘（sou.zhaopin.com）校招岗位抓取模块
// 列表页 SSR 字段完整：岗位名/公司/薪资/城市/经验/学历；无截止日期/HC（平台不展示）
// 抓取策略：关键词(2027届/校招/应届生/管培生) × 前 N 页，shouldKeep 过滤校招语义 + 目标城市
import crypto from 'node:crypto';
import { fetchText } from './liepin.mjs';

export const PROVIDER_NAME = 'zhaopin';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const KEYWORDS = ['2027%E5%B1%8A', '%E6%A0%A1%E6%8B%9B', '%E5%BA%94%E5%B1%8A%E7%94%9F', '%E7%AE%A1%E5%9F%B9%E7%94%9F'];
const TARGET_CITIES = ['深圳', '广州', '上海', '武汉', '长沙', '北京', '杭州', '苏州'];

// 校招语义：标题必须含校招标记，避免"急聘钳工"类普通岗混入
const KEEP_RX = /2027\s*届|\d{4}届|校招|校园|应届|管培生|管理培训生/;
const DROP_RX = /实习|兼职|日结|小时工|劳务派遣|短期/;

export function shouldKeepZhaopin(job, { targetCities = TARGET_CITIES } = {}) {
  if (job.closed) return false;
  const text = `${job.title} ${job.company}`;
  if (!KEEP_RX.test(text)) return false;
  if (DROP_RX.test(text)) return false;
  if (targetCities.length && !targetCities.includes(job.city)) return false;
  return true;
}

// 解析列表页岗位卡片（SSR）
export function parseListPage(html = '') {
  const jobs = [];
  const seen = new Set();
  // 卡片：jobinfo__name 链接 + 薪资 + 城市 + 学历 + companyinfo__name
  const cardRx = /jobdetail\/([A-Z0-9]+\.htm)"[^>]*class="jobinfo__name">([^<]+)<\/a>[\s\S]*?<p class="jobinfo__salary">\s*([^<]*?)\s*<\/p>[\s\S]*?<span>([^·<]*)(?:·[^<]*)?<\/span>[\s\S]*?(?:经验不限|[\d一二三四五六七八九十]+年经验)[\s\S]*?<\/div>[\s\S]*?class="companyinfo__name[^"]*">\s*([^<]*?)\s*<\/a>/g;
  let m;
  while ((m = cardRx.exec(html))) {
    const url = `https://www.zhaopin.com/jobdetail/${m[1]}`;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = decodeHtml(m[2]).trim();
    const salaryRaw = m[3].trim();
    const city = m[4].trim();
    const company = m[5].trim();
    jobs.push({
      id: `zhaopin-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`,
      url,
      title,
      company,
      city,
      salaryRaw
    });
  }
  return jobs;
}

function decodeHtml(s = '') {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// 薪资归一化：7000-9000元 → 7-9k；1-1.8万 → 10-18k；15-20K → 15-20k
export function normalizeSalary(raw = '') {
  const s = String(raw).trim();
  const m = s.match(/([\d.]+)\s*[-—~～至到]\s*([\d.]+)\s*(万|千|k|K)?(?:元)?/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    const unit = m[3] || '';
    if (unit.includes('万')) {
      a *= 10000;
      b *= 10000;
    } else if (unit.includes('千')) {
      a *= 1000;
      b *= 1000;
    }
    if (a >= 1000) return `${Math.round(a / 1000)}-${Math.round(b / 1000)}k`;
    return `${a}-${b}k`;
  }
  const single = s.match(/([\d.]+)\s*(万|千|k|K|元)?/);
  if (single) {
    let v = Number(single[1]);
    const unit = single[2] || '';
    if (unit.includes('万')) v *= 10000;
    else if (unit.includes('千')) v *= 1000;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    if (v >= 10) return `${v}k`;
  }
  return s;
}

// 抓取全部岗位：关键词 × 前 N 页；带整体时间预算（并发刷新时智联响应慢，超预算提前返回已发现部分）
export async function discoverJobs({ fetcher = fetchText, maxPages = 3, timeBudgetMs = 8 * 60 * 1000 } = {}) {
  const out = [];
  const seen = new Set();
  const deadline = Date.now() + timeBudgetMs;
  let exhausted = false;
  for (const kw of KEYWORDS) {
    if (exhausted) break;
    for (let p = 1; p <= maxPages; p++) {
      if (Date.now() > deadline) {
        exhausted = true;
        console.warn('[zhaopin] time budget exceeded, returning partial results');
        break;
      }
      const url = `https://sou.zhaopin.com/?kw=${kw}&p=${p}`;
      try {
        const html = await fetcher(url, { userAgent: UA, timeoutMs: 12000, retries: 1 });
        const jobs = parseListPage(html);
        if (jobs.length === 0) break; // 翻页到空
        for (const j of jobs) {
          if (seen.has(j.url)) continue;
          seen.add(j.url);
          out.push(j);
        }
      } catch (error) {
        console.warn(`[zhaopin] ${url} failed: ${error.message}`);
        break;
      }
      // 请求间隔，降低并发限流概率
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return out;
}

// 转换成标准 live-job 结构
export function toLiveJob(job, { now = new Date() } = {}) {  const text = `${job.title} ${job.company} ${job.city}`;
  const roleFamily = /产品|运营|市场|营销|品牌|HR|人力|行政|项目|管培|管理/.test(job.title) ? ['运营', '管理'] : ['其他'];
  const skills = [];
  const preferenceTags = /国际|海外|全球/.test(text) ? ['国际业务'] : [];
  return {
    id: job.id,
    company: job.company || '待核公司',
    title: job.title,
    roleFamily,
    city: job.city || '待核',
    graduationYear: '2027',
    skills,
    languages: /英语|英文|CET|雅思|托福|English/i.test(text) ? ['英语'] : [],
    experienceKeywords: [],
    preferenceTags,
    riskTags: [],
    source: '智联招聘',
    sourceType: 'secondary',
    sourceUrl: job.url,
    verification: '二手来源，待官网核验',
    publishedAt: '',
    deadline: '',
    description: `自动发现的校招类岗位；完整职责与要求请打开来源页面，并在投递前回公司校招官网核验。`,
    salary: normalizeSalary(job.salaryRaw),
    headCount: '',
    status: '推荐',
    discoveredAt: now.toISOString()
  };
}


// 智联聚合入口（与 refresh-jobs.mjs 的 addParallelTask 契约一致：返回 { jobs, stats }）
export async function searchZhaopinJobs(profile, {
  fetcher = fetchText,
  maxPages = profile.maxPages || 3,
  now = new Date()
} = {}) {
  const discovered = await discoverJobs({ fetcher, maxPages });
  const kept = discovered
    .map((j) => toLiveJob(j, { now }))
    .filter((j) => shouldKeepZhaopin(j, { targetCities: profile.targetCities }));
  return {
    jobs: kept,
    stats: {
      discovered: discovered.length,
      keptJobs: kept.length
    }
  };
}
