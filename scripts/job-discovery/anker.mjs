import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM'];
const MAINLAND_CITIES = CITY_NAMES.filter((city) => city !== '香港');
const CHINA_COUNTRY_RX = /中国大陆|中华人民共和国|中国内地|\bPRC\b|People'?s Republic of China|^China$|^中国$/i;
const OVERSEAS_PLACE_RX = /美国|德国|日本|英国|法国|加拿大|澳大利亚|迪拜|荷兰|巴西|土耳其|瑞典|印尼|新加坡|越南|泰国|韩国|意大利|西班牙|波兰|摩洛哥|墨西哥|印度|越南|非洲|欧洲|南美|北美|United States|\bUSA\b|Germany|Japan|United Kingdom|\bUK\b|France|Canada|Australia|Netherlands|Brazil|Turkey|Sweden|Indonesia|Singapore|Vietnam|Thailand|Korea|Italy|Spain|Poland|Mexico|Düsseldorf|Dusseldorf|Seattle|Austin|Tokyo|Osaka|London|Paris|Berlin|Munich|Sydney|Melbourne|Toronto|Vancouver/i;
const OVERSEAS_VISA_RX = /工作签证|work visa|valid work visa|sponsorship/i;

function text(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function nameOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return text(value.zh_cn || value.name || value.en_us || '');
  return text(value);
}
function nestedName(value) { return nameOf(value?.name || value); }
function cityOf(row = {}) {
  const raw = nestedName(row?.address?.city) || nestedName(row?.city) || '';
  return MAINLAND_CITIES.find((city) => raw.includes(city)) || raw || '待核';
}
function countryOf(row = {}) {
  return nestedName(row?.address?.country) || nestedName(row?.country) || '';
}
function locationBlob(row = {}) {
  const title = typeof row.title === 'object' ? nameOf(row.title) : text(row.title || '');
  return [title, cityOf(row), countryOf(row), nestedName(row?.address), nestedName(row?.address?.state)].join(' ');
}
export function isOverseasAnkerJob(row = {}) {
  const country = countryOf(row);
  if (country && !CHINA_COUNTRY_RX.test(country)) return true;
  const blob = locationBlob(row);
  if (OVERSEAS_PLACE_RX.test(blob)) return true;
  const desc = text(row.description || '');
  if (OVERSEAS_VISA_RX.test(desc) && OVERSEAS_PLACE_RX.test(`${blob} ${desc}`)) return true;
  return false;
}
function isCampus(row = {}) {
  const subject = nestedName(row?.subject).toLowerCase();
  return /校招|校园|应届|campus|graduate|实习|intern/.test(subject);
}

export function parseAnkerJob(source, row = {}, now = new Date()) {
  const rawId = String(row.source_job_id || row.id || '');
  const title = text(row.title || '');
  const descriptionText = text(row.description || '');
  const requirementText = text(row.requirement || '');
  const subject = nestedName(row.subject);
  const jobFunction = nestedName(row.job_function);
  const jobText = [title, subject, jobFunction, descriptionText, requirementText].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `anker-${crypto.createHash('sha1').update(`${source.websiteId}|${rawId}|${title}`).digest('hex').slice(0,12)}`,
    company: source.company || '安克创新',
    title,
    roleFamily,
    city: cityOf(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: /英语|英文|CET|English/i.test(jobText) ? ['英语'] : [],
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0,8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '安克创新官方2027校招官网',
    sourceType: 'official',
    sourceUrl: source.url,
    verification: '官方招聘官网',
    publishedAt: '',
    deadline: '',
    description: `安克创新官方 2027 全球校招岗位；${jobFunction ? `职类：${jobFunction}。` : ''}${skills.length ? `识别关键词：${skills.slice(0,5).join('、')}。` : ''}投递前请打开官方校招页确认最新状态。`,
    salary: extractSalary(jobText),
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: descriptionText,
    jobRequirements: requirementText,
    _searchText: jobText,
    _subject: subject,
    _sourceJobId: rawId
  };
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`HTTP ${response.status} ${label}`);
  const payload = await response.json();
  if (!payload || payload.code !== 0) throw new Error(payload?.message || `bad Anker API payload: ${label}`);
  return payload;
}

function nextToken(payload = {}) {
  const data = payload?.data || {};
  return String(data.next_page_token || data.nextPageToken || data.page_token || data.pageToken || '').trim();
}

export async function searchAnkerJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.websiteId) return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, overseasSkipped: 0, snapshotComplete: false } };
  const apiBase = String(source.apiBase || 'https://rainbowbridge.anker.com').replace(/\/$/, '');
  const websiteId = encodeURIComponent(source.websiteId);
  const limit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 500));
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 10), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 30), 50));
  let errors = 0, listed = 0, detailed = 0, pages = 0, overseasSkipped = 0;
  const jobs = [];
  const rows = [];
  const seenIds = new Set();
  const seenTokens = new Set(['']);
  let token = '';
  let snapshotComplete = false;

  try {
    for (let page = 0; page < pageLimit && rows.length < limit; page++) {
      const listUrl = `${apiBase}/api/lark/hire/v1/websites/${websiteId}/job_posts/search?page_size=${size}&page_token=${encodeURIComponent(token)}`;
      const listResponse = await fetcher(listUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.5)' },
        body: JSON.stringify({ job_function_id_list: [], city_code_list: [], keyword: '', job_lang_list: [] })
      });
      const payload = await readJson(listResponse, `Anker list page ${page + 1}`);
      pages++;
      const pageRows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      listed += pageRows.length;
      let added = 0;
      for (const row of pageRows) {
        const id = String(row?.id || '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        if (isOverseasAnkerJob(row)) {
          overseasSkipped++;
          continue;
        }
        rows.push(row);
        added++;
        if (rows.length >= limit) break;
      }
      const next = nextToken(payload);
      const hasMore = payload?.data?.has_more ?? payload?.data?.hasMore;
      if (!pageRows.length || (added === 0 && overseasSkipped > 0 && !hasMore) || hasMore === false || !next || seenTokens.has(next)) {
        snapshotComplete = hasMore === false || !pageRows.length || !next;
        break;
      }
      seenTokens.add(next);
      token = next;
    }

    for (const row of rows.slice(0, limit)) {
      if (!row?.id || !row?.title || !isCampus(row) || isOverseasAnkerJob(row)) {
        if (row && isOverseasAnkerJob(row)) overseasSkipped++;
        continue;
      }
      try {
        const detailUrl = `${apiBase}/api/lark/hire/v1/websites/${websiteId}/job_posts/${encodeURIComponent(row.id)}`;
        const detailPayload = await readJson(await fetcher(detailUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.5)' } }), 'Anker detail');
        const detail = detailPayload?.data?.job_post || {};
        detailed++;
        const merged = { ...row, ...detail, source_job_id: row.id };
        if (isOverseasAnkerJob(merged)) {
          overseasSkipped++;
          continue;
        }
        const job = parseAnkerJob(source, merged, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
    }
  } catch { errors++; }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, overseasSkipped, snapshotComplete } };
}
