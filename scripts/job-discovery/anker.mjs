import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM'];

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
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
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
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
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

export async function searchAnkerJobs(profile, source, { fetcher = fetch, maxJobs = 30, now = new Date() } = {}) {
  if (!source?.websiteId) return { jobs: [], stats: { listed: 0, detailed: 0, keptJobs: 0, errors: 1 } };
  const apiBase = String(source.apiBase || 'https://rainbowbridge.anker.com').replace(/\/$/, '');
  const websiteId = encodeURIComponent(source.websiteId);
  const listUrl = `${apiBase}/api/lark/hire/v1/websites/${websiteId}/job_posts/search?page_size=10&page_token=`;
  let errors = 0, listed = 0, detailed = 0;
  const jobs = [];
  try {
    const listResponse = await fetcher(listUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4)' },
      body: JSON.stringify({ job_function_id_list: [], city_code_list: [], keyword: '', job_lang_list: [] })
    });
    const listPayload = await readJson(listResponse, 'Anker list');
    const rows = Array.isArray(listPayload?.data?.items) ? listPayload.data.items : [];
    listed = rows.length;
    for (const row of rows.slice(0, Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 30), 50)))) {
      if (!row?.id || !row?.title || !isCampus(row)) continue;
      try {
        const detailUrl = `${apiBase}/api/lark/hire/v1/websites/${websiteId}/job_posts/${encodeURIComponent(row.id)}`;
        const detailPayload = await readJson(await fetcher(detailUrl, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4)' } }), 'Anker detail');
        const detail = detailPayload?.data?.job_post || {};
        detailed++;
        const job = parseAnkerJob(source, { ...row, ...detail, source_job_id: row.id }, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
    }
  } catch { errors++; }
  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { listed, detailed, keptJobs: kept.length, errors } };
}
