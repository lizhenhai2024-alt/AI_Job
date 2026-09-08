import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户'];
const CAMPUS_RX = /2027届|2027\s*届|校园招聘|校园|校招|应届|飞星|飞凡|校园大使/i;
const SOCIAL_RX = /社会招聘|社招/i;
const PURE_SALES_TITLE_RX = /销售管培生|销售代表|销售经理|渠道销售|区域销售|大客户销售|销售顾问|销售专员/i;

function cleanText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtmlText(value = '') {
  return cleanText(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '));
}

function normalizeDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : '';
}

function cityFrom(row = {}) {
  const raw = Array.isArray(row.LocNames) ? row.LocNames.join('、') : String(row.LocNames || row.LocName || '');
  const city = CITY_NAMES.find((name) => raw.includes(name));
  if (city) return city;
  if (raw.includes('全国')) return '全国';
  if (/国外|海外/.test(raw)) return '国外';
  return raw || '待核';
}

export function explicitCohortYears(text = '') {
  return [...new Set([...String(text).matchAll(/(20\d{2})\s*届/g)].map((match) => match[1]))];
}

export function resolveBeisenGraduationYear(source = {}, jobText = '') {
  const configured = String(source.graduationYear || '');
  if (!configured) return '';
  const years = explicitCohortYears(jobText);
  if (years.length && !years.includes(configured)) return '';
  return configured;
}

export function isBeisenTitleAllowed(title = '') {
  const value = String(title || '');
  return !/实习/i.test(value) && !PURE_SALES_TITLE_RX.test(value);
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
  const base = source.baseUrl.replace(/\/$/,'');
  const detailUrl = row.DetailUrl
    ? String(row.DetailUrl)
    : rawId
      ? `${base}/campus/detail?jobAdId=${encodeURIComponent(rawId)}`
      : `${base}/campus/jobs`;
  const years = explicitCohortYears(jobText);
  const graduationYear = resolveBeisenGraduationYear(source, jobText);
  const configured = String(source.graduationYear || '');
  const verification = graduationYear
    ? years.includes(configured)
      ? '官方招聘官网 · JD明确2027届'
      : source.campaignLabel
        ? `官方招聘官网 · 已核验${source.campaignLabel}`
        : '官方招聘官网 · 2027校招源（JD未单列届别）'
    : years.length
      ? `官方招聘官网 · JD届别冲突（${years.join('/')}届）`
      : '官方招聘官网';
  return {
    id: `beisen-${crypto.createHash('sha1').update(`${source.baseUrl}|${rawId}|${title}`).digest('hex').slice(0,12)}`,
    company: source.company,
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear,
    skills,
    languages: /英语|英文|CET|雅思|托福|English/i.test(jobText) ? ['英语'] : [],
    experienceKeywords,
    preferenceTags,
    riskTags,
    source: '公司官方北森校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl,
    verification,
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

function addGenericCampusRows(source, html, rows, seen) {
  for (const tr of String(html).match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const anchors = [...tr.matchAll(/<a[^>]+href=["']([^"']*\/campus\/detail\?jobAdId=([^"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (!anchors.length) continue;
    const rowText = cleanText(tr);
    const locations = CITY_NAMES.filter((city) => rowText.includes(city));
    for (const match of anchors) {
      const id = decodeURIComponent(match[2] || '');
      const title = cleanText(match[3] || '');
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        JobAdId: id,
        JobAdName: title,
        Category: '校园招聘',
        LocNames: locations,
        Duty: rowText,
        Require: '',
        PostDate: normalizeDate(rowText),
        DetailUrl: new URL(match[1].replace(/&amp;/gi, '&'), source.baseUrl).href
      });
    }
  }
}

function addItgCampusRows(source, html, rows, seen) {
  for (const li of String(html).match(/<li\b[\s\S]*?<\/li>/gi) || []) {
    const anchor = li.match(/<a[^>]+href=["']([^"']*\/gmkgxzxq\?[^"']*jobId=([^"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const id = decodeURIComponent(anchor[2] || '');
    if (!id || seen.has(id)) continue;
    const body = anchor[3] || '';
    const titleHtml = (body.match(/<h2[^>]*>([\s\S]*?)(?:<span|<\/h2>)/i) || [,''])[1];
    const title = cleanText(titleHtml) || cleanText(body).split(' 招聘单位：')[0];
    if (!title) continue;
    seen.add(id);
    const rowText = cleanText(li);
    const locations = CITY_NAMES.filter((city) => rowText.includes(city));
    if (rowText.includes('全国')) locations.push('全国');
    if (/国外|海外/.test(rowText)) locations.push('国外');
    rows.push({
      JobAdId: id,
      JobAdName: title,
      Category: '校园招聘',
      LocNames: [...new Set(locations)],
      Duty: rowText,
      Require: '',
      PostDate: normalizeDate(rowText),
      DetailUrl: new URL(anchor[1].replace(/&amp;/gi, '&'), source.baseUrl).href
    });
  }
}

export function parseBeisenCampusHtml(source, html = '') {
  const rows = [];
  const seen = new Set();
  addGenericCampusRows(source, html, rows, seen);
  addItgCampusRows(source, html, rows, seen);
  return rows;
}

function extractDetailFields(html = '') {
  const text = cleanHtmlText(html);
  const start = text.indexOf('职位详情');
  const begin = start >= 0 ? start : 0;
  const endMarker = text.indexOf('立即申请', begin);
  const detail = text.slice(begin, endMarker > begin ? endMarker : Math.min(text.length, begin + 9000));
  const salary = (detail.match(/薪资范围[:：]\s*(.+?)\s+发布时间[:：]/) || [,''])[1].trim();
  const address = (detail.match(/工作地址[:：]\s*(.+?)\s+工作职责/) || [,''])[1].trim();
  const requireIndex = detail.indexOf('任职资格');
  const require = requireIndex >= 0 ? detail.slice(requireIndex) : '';
  return { detail, salary, address, require };
}

async function enrichHtmlRow(row, fetcher = fetch) {
  if (!row?.DetailUrl) return row;
  const response = await fetcher(row.DetailUrl, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4; +https://github.com/lizhenhai2024-alt/AI_Job)'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} detail ${row.DetailUrl}`);
  const fields = extractDetailFields(await response.text());
  return {
    ...row,
    Duty: fields.detail || row.Duty,
    Require: fields.require || row.Require,
    Salary: fields.salary || row.Salary,
    LocNames: fields.address || row.LocNames
  };
}

function isCampusRow(job) {
  const evidence = `${job.title}\n${job._category || ''}\n${job._searchText || ''}`;
  if (SOCIAL_RX.test(job._category || '') && !/2027届|2027\s*届/.test(job.title)) return false;
  return CAMPUS_RX.test(evidence);
}

function htmlPageUrl(source, pageIndex) {
  const base = source.baseUrl.replace(/\/$/, '');
  if (!source.listUrl) return `${base}/campus/?PageIndex=${pageIndex + 1}`;
  const url = new URL(source.listUrl, base);
  url.searchParams.set('PageIndex', String(pageIndex + 1));
  return url.href;
}

async function fetchHtmlCampusPage(source, pageIndex, fetcher = fetch) {
  const url = htmlPageUrl(source, pageIndex);
  const response = await fetcher(url, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4; +https://github.com/lizhenhai2024-alt/AI_Job)'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} HTML fallback for ${source.company}`);
  const html = await response.text();
  return { rows: parseBeisenCampusHtml(source, html), total: Number.POSITIVE_INFINITY, mode: 'html' };
}

async function fetchApiPage(source, pageIndex, pageSize, fetcher = fetch) {
  const base = source.baseUrl.replace(/\/$/, '');
  const response = await fetcher(`${base}/api/Jobad/GetJobAdPageList`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4; +https://github.com/lizhenhai2024-alt/AI_Job)',
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
      PortalId: source.portalId || '',
      DisplayFields: ['Category','Kind','LocId','Org','HeadCount','PostDate','Salary','Duty','Require']
    })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.company}`);
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error(`non-JSON Beisen response for ${source.company}`); }
  if (payload?.Code !== 200 || !Array.isArray(payload?.Data)) throw new Error(payload?.Message || `bad Beisen response for ${source.company}`);
  return { rows: payload.Data, total: Number(payload.Count ?? payload.Total ?? payload.Data.length), mode: 'api' };
}

async function fetchPage(source, pageIndex, pageSize, fetcher = fetch) {
  if (source.mode === 'html') return fetchHtmlCampusPage(source, pageIndex, fetcher);
  return fetchApiPage(source, pageIndex, pageSize, fetcher);
}

export async function searchBeisenJobs(profile, sources = [], { fetcher = fetch, pageSize = 50, maxPages = 12, now = new Date() } = {}) {
  const jobs = [];
  let scannedPortals = 0, scannedRows = 0, errors = 0;
  const perPortal = {};

  for (const source of sources) {
    let portalRows = 0, portalKept = 0, cohortRejected = 0, titleRejected = 0, detailErrors = 0, mode = source.mode || 'api';
    try {
      const seen = new Set();
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        const result = await fetchPage(source, pageIndex, pageSize, fetcher);
        const { rows, total } = result;
        mode = result.mode;
        if (pageIndex === 0) scannedPortals++;
        if (!rows.length) break;
        let added = 0;
        for (const row of rows) {
          const key = String(row.JobAdId ?? row.Id ?? `${row.JobAdName}|${row.LocNames}`);
          if (seen.has(key)) continue;
          seen.add(key); added++; portalRows++; scannedRows++;
          let normalizedRow = row;
          if (mode === 'html' && source.enrichDetails && row.DetailUrl) {
            try { normalizedRow = await enrichHtmlRow(row, fetcher); }
            catch { detailErrors++; }
          }
          const job = parseBeisenRow(source, normalizedRow, now);
          if (!isCampusRow(job)) continue;
          if (!isBeisenTitleAllowed(job.title)) { titleRejected++; continue; }
          if (!job.graduationYear) { cohortRejected++; continue; }
          if (job.riskTags?.includes('纯销售')) continue;
          if (shouldKeep(job, profile, now)) { jobs.push(job); portalKept++; }
        }
        if (!added) break;
        if (mode === 'api' && (rows.length < pageSize || seen.size >= total)) break;
      }
      perPortal[source.company] = { scannedRows: portalRows, keptJobs: portalKept, cohortRejected, titleRejected, detailErrors, mode };
    } catch (error) {
      errors++;
      perPortal[source.company] = { scannedRows: portalRows, keptJobs: portalKept, cohortRejected, titleRejected, detailErrors, mode, error: String(error?.message || error) };
    }
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { portals: sources.length, scannedPortals, scannedRows, keptJobs: kept.length, errors, perPortal } };
}
