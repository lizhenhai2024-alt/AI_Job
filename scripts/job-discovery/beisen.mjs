import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'];
const CAMPUS_RX = /2027届|2027\s*届|校园招聘|校园|校招|应届|飞星|飞凡|校园大使/i;
const SOCIAL_RX = /社会招聘|社招/i;

function cleanText(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : '';
}

function cityFrom(row = {}) {
  const raw = Array.isArray(row.LocNames) ? row.LocNames.join('、') : String(row.LocNames || row.LocName || '');
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

export function parseBeisenRow(source, row = {}, now = new Date()) {
  const rawId = String(row.JobAdId ?? row.Id ?? '');
  const title = cleanText(row.JobAdName || row.Name || '');
  const category = cleanText(row.Category || '');
  const duty = cleanText(row.Duty || '');
  const require = cleanText(row.Require || '');
  const org = cleanText(row.Org || '');
  const jobText = [title, category, org, duty, require].filter(Boolean).join('\n');
  const roleFamily = classifyRole(title);
  const skills = detectSkills(jobText);
  const experienceKeywords = EXPERIENCE_WORDS.filter((w) => jobText.includes(w)).slice(0,8);
  const preferenceTags = [
    /海外|国际|全球/.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场/.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);
  const detailUrl = rawId ? `${source.baseUrl.replace(/\/$/,'')}/campus/detail?jobAdId=${encodeURIComponent(rawId)}` : `${source.baseUrl.replace(/\/$/,'')}/campus/jobs`;
  return {
    id: `beisen-${crypto.createHash('sha1').update(`${source.baseUrl}|${rawId}|${title}`).digest('hex').slice(0,12)}`,
    company: source.company,
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: /英语|英文|CET|雅思|托福|English/i.test(jobText) ? ['英语'] : [],
    experienceKeywords,
    preferenceTags,
    riskTags,
    source: '公司官方北森校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl,
    verification: '官方招聘官网',
    publishedAt: normalizeDate(row.PostDate),
    deadline: '',
    description: `公司官方北森校招岗位；${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary: cleanText(row.Salary || ''),
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText,
    _category: category
  };
}

function isCampusRow(job) {
  const evidence = `${job.title}\n${job._category || ''}\n${job._searchText || ''}`;
  if (SOCIAL_RX.test(job._category || '') && !/2027届|2027\s*届/.test(job.title)) return false;
  return CAMPUS_RX.test(evidence);
}

async function fetchPage(source, pageIndex, pageSize, fetcher = fetch) {
  const base = source.baseUrl.replace(/\/$/, '');
  const response = await fetcher(`${base}/api/Jobad/GetJobAdPageList`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.3; +https://github.com/lizhenhai2024-alt/AI_Job)',
      referer: `${base}/campus/jobs`,
      origin: base,
      'x-requested-with': 'xmlhttprequest',
      langtype: 'zh_CN'
    },
    body: JSON.stringify({
      PageIndex: pageIndex,
      PageSize: pageSize,
      KeyWords: '',
      SpecialType: 0,
      PortalId: '',
      DisplayFields: ['Category','Kind','LocId','Org','HeadCount','PostDate','Salary','Duty','Require']
    })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.company}`);
  const payload = await response.json();
  if (payload?.Code !== 200 || !Array.isArray(payload?.Data)) throw new Error(payload?.Message || `bad Beisen response for ${source.company}`);
  return { rows: payload.Data, total: Number(payload.Count ?? payload.Total ?? payload.Data.length) };
}

export async function searchBeisenJobs(profile, sources = [], { fetcher = fetch, pageSize = 50, maxPages = 12, now = new Date() } = {}) {
  const jobs = [];
  let scannedPortals = 0, scannedRows = 0, errors = 0;
  const perPortal = {};

  for (const source of sources) {
    let portalRows = 0, portalKept = 0;
    try {
      const seen = new Set();
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        const { rows, total } = await fetchPage(source, pageIndex, pageSize, fetcher);
        if (pageIndex === 0) scannedPortals++;
        if (!rows.length) break;
        let added = 0;
        for (const row of rows) {
          const key = String(row.JobAdId ?? row.Id ?? `${row.JobAdName}|${row.LocNames}`);
          if (seen.has(key)) continue;
          seen.add(key); added++; portalRows++; scannedRows++;
          const job = parseBeisenRow(source, row, now);
          if (!isCampusRow(job)) continue;
          if (job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) { jobs.push(job); portalKept++; }
        }
        if (!added || rows.length < pageSize || seen.size >= total) break;
      }
      perPortal[source.company] = { scannedRows: portalRows, keptJobs: portalKept };
    } catch (error) {
      errors++;
      perPortal[source.company] = { scannedRows: portalRows, keptJobs: portalKept, error: String(error?.message || error) };
    }
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { portals: sources.length, scannedPortals, scannedRows, keptJobs: kept.length, errors, perPortal } };
}
