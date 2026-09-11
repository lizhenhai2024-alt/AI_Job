import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';
import { detectLanguages } from './languages.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','人力资源','社媒','管培'];
const UA = 'Mozilla/5.0 (compatible; AI-Job/0.8; +https://github.com/lizhenhai2024-alt/AI_Job)';
const DEFAULT_API_BASE = 'https://careers.oppo.com';
const DEFAULT_LIST_URL = 'https://careers.oppo.com/university/oppo/campus/post';
const GRADUATE_TYPE_RX = /Graduate|应届/i;
const INTERN_TYPE_RX = /Intern|实习/i;
const DOCTOR_TYPE_RX = /doctor|博士/i;
const TITLE_ROLE_HINTS = [
  [/Product Marketing/i, '产品营销'],
  [/Product Operation/i, '产品运营'],
  [/Channel Manager/i, '市场营销 渠道'],
  [/招聘/, '人力资源'],
  [/媒介|品牌策划/, '品牌策划 产品营销'],
  [/管理培训生|管培生/, '市场营销 管培生'],
  [/社媒/, '社媒运营 内容运营'],
  [/人力资源|HRBP|\bHR\b/, '人力资源']
];

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function apiBaseOf(source = {}) {
  return String(source.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
}

function listUrlOf(source = {}) {
  return String(source.url || source.baseUrl || DEFAULT_LIST_URL).replace(/\/$/, '');
}

function tenantIdOf(source = {}) {
  return String(source.tenantId || 1000);
}

function cityFrom(row = {}, title = '') {
  const raw = clean(row.workCityName || '');
  const inTitle = CITY_NAMES.find((city) => title.includes(city));
  if (inTitle) return inTitle;
  return CITY_NAMES.find((city) => raw.includes(city)) || raw || '待核';
}

function roleBlob(title = '', category = '') {
  const hints = TITLE_ROLE_HINTS.filter(([rx]) => rx.test(`${title} ${category}`)).map(([, hint]) => hint);
  return [title, category, ...hints].filter(Boolean).join(' ');
}

export function isOppoInternRow(row = {}) {
  const blob = [
    row.recruitmentType,
    row.recruitmentTypeName,
    row.projectName,
    row.positionName,
    row.title
  ].map(clean).join(' ');
  return INTERN_TYPE_RX.test(blob);
}

export function isOppoGraduateRow(row = {}) {
  if (isOppoInternRow(row) || DOCTOR_TYPE_RX.test(clean(row.recruitmentType || row.recruitmentTypeName || ''))) return false;
  const blob = [row.recruitmentType, row.recruitmentTypeName, row.projectName].map(clean).join(' ');
  return GRADUATE_TYPE_RX.test(blob) || /2027/.test(blob);
}

function detailUrl(source, positionId) {
  const base = listUrlOf(source);
  return positionId ? `${base}/${encodeURIComponent(positionId)}` : base;
}

function requestHeaders(source = {}) {
  const origin = apiBaseOf(source);
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'user-agent': UA,
    'Tenant-Id': tenantIdOf(source),
    origin,
    referer: `${origin}/university/oppo/campus/post`
  };
}

export function parseOppoJob(source, row = {}, now = new Date()) {
  const positionId = String(row.idRecruitPosition || row.projectPositionId || '');
  const title = clean(row.positionName || row.projectPositionName || '');
  const category = clean(row.positionTypeName || '');
  const duty = clean(row.positionDesc || row.projectPositionDesc || '');
  const requirement = clean(row.positionRequire || row.projectPositionRequire || row.knowledgeSkill || '');
  const projectName = clean(row.projectName || '');
  const recruitType = clean(row.recruitmentTypeName || row.recruitmentType || '');
  const bonus = clean(row.bonusItem || '');
  const jobText = [title, category, projectName, recruitType, duty, requirement, bonus].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(roleBlob(title, category));
  const languages = detectLanguages(jobText);
  const preferenceTags = [
    /海外|国际|全球|global|Gurugram|外派|驻外/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|多语种|小语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  return {
    id: `oppo-${crypto.createHash('sha1').update(`${positionId}|${title}|${cityFrom(row, title)}`).digest('hex').slice(0, 12)}`,
    company: source.company || 'OPPO',
    title,
    roleFamily,
    city: cityFrom(row, title),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages,
    experienceKeywords: EXPERIENCE_WORDS.filter((word) => jobText.toLowerCase().includes(word.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: 'OPPO官方2027校招官网',
    sourceType: 'official',
    sourceUrl: detailUrl(source, positionId),
    verification: '官方招聘官网/API；项目名标注2027届应届生校园招聘',
    publishedAt: clean(row.releaseTime || ''),
    deadline: '',
    description: `OPPO官方2027校招岗位；${category ? `职类：${category}。` : ''}${projectName ? `批次：${projectName}。` : ''}${recruitType ? `类型：${recruitType}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: extractSalary(jobText),
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: duty,
    jobRequirements: requirement,
    _searchText: jobText,
    _recruitType: recruitType,
    _subject: projectName,
    _sourceJobId: positionId
  };
}

async function requestJson(fetcher, url, { method = 'GET', body, source, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method,
      headers: requestHeaders(source),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (Number(payload?.code) !== 0) throw new Error(payload?.msg || 'bad OPPO payload');
    return payload?.data;
  } finally {
    clearTimeout(timer);
  }
}

function graduateProjectsFrom(list = [], source = {}) {
  const rows = Array.isArray(list) ? list : [];
  const matched = rows.filter((row) => {
    const type = clean(row.recruitmentType || row.recruitmentTypeName || '');
    const name = clean(row.projectName || '');
    if (INTERN_TYPE_RX.test(`${type} ${name}`) || DOCTOR_TYPE_RX.test(type)) return false;
    return GRADUATE_TYPE_RX.test(`${type} ${name}`) && /2027/.test(name);
  });
  if (matched.length) {
    return matched.map((row) => ({
      projectId: Number(row.idRecruitProject),
      recruitmentType: row.recruitmentType || 'Graduate',
      isAllNode: row.specialRecruitmentList ? 'N' : 'Y',
      themeList: []
    })).filter((row) => Number.isFinite(row.projectId));
  }
  const fallbackId = Number(source.projectId || 30);
  return Number.isFinite(fallbackId)
    ? [{ projectId: fallbackId, recruitmentType: 'Graduate', isAllNode: 'Y', themeList: [] }]
    : [];
}

export async function searchOppoJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url && !source?.apiBase) {
    return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors: 1, snapshotComplete: false, emptyResult: true } };
  }
  const base = apiBaseOf(source);
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 50), 50));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 10), 30));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 400), 800));
  let pages = 0;
  let listed = 0;
  let detailed = 0;
  let errors = 0;
  let internRejected = 0;
  const jobs = [];
  const seen = new Set();
  let snapshotComplete = false;

  try {
    const projectList = await requestJson(fetcher, `${base}/openapi/position/project/list`, { source });
    const projectFilter = graduateProjectsFrom(projectList, source);
    if (!projectFilter.length) throw new Error('OPPO graduate project not found');

    for (let page = 1; page <= pageLimit && seen.size < jobLimit; page++) {
      const data = await requestJson(fetcher, `${base}/openapi/position/pageNew`, {
        method: 'POST',
        source,
        body: {
          pageNum: page,
          pageSize: size,
          positionName: '',
          projectList: projectFilter,
          positionTypeList: [],
          workCityCodeList: [],
          shareId: ''
        }
      });
      pages++;
      const rows = Array.isArray(data?.records) ? data.records : [];
      const totalPages = Number(data?.pages || 0);
      listed += rows.length;
      let added = 0;
      for (const row of rows) {
        const id = String(row?.idRecruitPosition || row?.projectPositionId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        added++;
        if (isOppoInternRow(row) || !isOppoGraduateRow(row)) {
          internRejected++;
          continue;
        }
        detailed++;
        const job = parseOppoJob(source, row, now);
        if (!job.title || job.riskTags?.includes('纯销售')) continue;
        if (shouldKeep(job, profile, now)) jobs.push(job);
        if (seen.size >= jobLimit) break;
      }
      if (!rows.length || added === 0 || (totalPages && page >= totalPages) || rows.length < size) {
        snapshotComplete = !rows.length || (totalPages ? page >= totalPages : rows.length < size);
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
  return {
    jobs: kept,
    stats: {
      pages,
      listed,
      detailed,
      keptJobs: kept.length,
      errors,
      internRejected,
      snapshotComplete,
      emptyResult
    }
  };
}
