import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','人力资源'];

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityFrom(row = {}) {
  const raw = clean(row.workplace || '');
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

function detailUrl(source, positionId) {
  const base = String(source.url || 'https://job.xiaohongshu.com/campus/position').split('#')[0].replace(/\/$/, '');
  return positionId ? `${base}?positionId=${encodeURIComponent(positionId)}` : base;
}

export function parseXiaohongshuJob(source, row = {}, now = new Date()) {
  const rawId = String(row.positionId || '');
  const title = clean(row.positionName || '');
  const duty = clean(row.duty || '');
  const qualification = clean(row.qualification || '');
  const directionName = clean(row.directionName || '');
  const subDirectionName = clean(row.subDirectionName || '');
  const projectName = clean(row.jobProjectName || '');
  const jobText = [title, directionName, subDirectionName, projectName, duty, qualification].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const experienceKeywords = EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `xiaohongshu-${crypto.createHash('sha1').update(`${rawId}|${title}|${cityFrom(row)}`).digest('hex').slice(0, 12)}`,
    company: source.company || '小红书',
    title,
    roleFamily,
    city: cityFrom(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: /英语|英文|CET|雅思|托福|English/i.test(jobText) ? ['英语'] : [],
    experienceKeywords,
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '小红书官方2027校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl(source, rawId),
    verification: '官方招聘官网/API',
    publishedAt: clean(row.publishTime || ''),
    deadline: '',
    description: `小红书官方 2027 校园招聘岗位；${directionName ? `职类：${directionName} / ${subDirectionName}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态与截止日期。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),    jobDescription: row.description || '',
    jobRequirements: row.requirement || '',

    _searchText: jobText,
    _recruitStatus: clean(row.recruitStatus || '')
  };
}

async function postPage(fetcher, source, pageNum, pageSize) {
  const base = String(source.apiBase || 'https://job.xiaohongshu.com').replace(/\/$/, '');
  const jobProjects = Array.isArray(source.jobProjects) && source.jobProjects.length
    ? source.jobProjects
    : ['campus_autumn_27'];
  const body = {
    positionName: '',
    pageNum,
    pageSize,
    recruitType: 'campus',
    jobProjects
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const response = await fetcher(`${base}/websiterecruit/position/pageQueryPosition`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.6)',
        origin: base,
        referer: `${base}/campus/position`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.statusCode !== 200) throw new Error(payload?.alertMsg || 'bad XHS payload');
    return payload?.data || {};
  } finally {
    clearTimeout(timer);
  }
}

export async function searchXiaohongshuJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false } };
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 20), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 20), 50));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));
  let pages = 0, listed = 0, detailed = 0, errors = 0;
  const jobs = [];
  const seen = new Set();
  let snapshotComplete = false;

  try {
    for (let page = 1; page <= pageLimit && seen.size < jobLimit; page++) {
      const data = await postPage(fetcher, source, page, size);
      pages++;
      const rows = Array.isArray(data.list) ? data.list : [];
      listed += rows.length;
      detailed += rows.length;
      let added = 0;
      for (const row of rows) {
        const id = String(row?.positionId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        added++;
        const job = parseXiaohongshuJob(source, row, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
        if (seen.size >= jobLimit) break;
      }
      const totalPage = Number(data.totalPage || 0);
      if (!rows.length || added === 0 || (totalPage && page >= totalPage)) {
        snapshotComplete = true;
        break;
      }
    }
  } catch {
    errors++;
  }

  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) errors++;
  if (emptyResult) snapshotComplete = false;

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed, keptJobs: kept.length, errors, snapshotComplete, emptyResult } };
}
