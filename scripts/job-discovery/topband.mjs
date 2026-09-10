import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','招聘','人力资源','商务','社媒'];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function clean(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// workingPlace examples: "广东-深圳", "广东-深圳    国外-越南", "广东-惠州"
function cityFrom(workingPlace = '', title = '') {
  const raw = String(workingPlace || '').replace(/\s+/g, ' ').trim();
  const inTitle = CITY_NAMES.find((c) => title.includes(c));
  if (inTitle) return inTitle;
  return CITY_NAMES.find((c) => raw.includes(c)) || raw.split(' ')[0] || '待核';
}

function languagesFrom(text = '') {
  const found = [];
  if (/英语|英文|English|CET/i.test(text)) found.push('英语');
  if (/日语|Japanese/i.test(text)) found.push('日语');
  if (/韩语|Korean/i.test(text)) found.push('韩语');
  if (/西班牙语|Spanish/i.test(text)) found.push('西班牙语');
  if (/法语|French/i.test(text)) found.push('法语');
  if (/德语|German/i.test(text)) found.push('德语');
  if (/葡萄牙语|Portuguese/i.test(text)) found.push('葡萄牙语');
  if (/越南语/i.test(text)) found.push('越南语');
  return [...new Set(found)];
}

function stripCohortPrefix(title = '') {
  return String(title).replace(/^[\[【]?\s*(?:20)?27\s*校招[】\]\-—\s]*/g, '').trim();
}

function detailUrl(source, positionId) {
  const base = String(source.baseUrl || 'https://campus.topband.com.cn').replace(/\/$/, '');
  const token = source.token || '';
  if (positionId) return `${base}/company/tuobang/${token}#/positionDetail?positionId=${encodeURIComponent(positionId)}&wt=1&token=${encodeURIComponent(token)}`;
  return `${base}/company/tuobang/${token}#/index?wt=1`;
}

export function parseTopbandJob(source, row = {}, now = new Date()) {
  const positionId = String(row.positionId || '');
  const rawTitle = clean(row.positionName || '');
  const title = stripCohortPrefix(rawTitle);
  const desc = clean(row.positionDesc || '');
  const functionName = clean(row.functionName || '');
  const nature = clean(row.positionNature || '');
  const jobText = [rawTitle, functionName, nature, desc].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  let roleFamily = classifyRole(title);
  // 通用分类未覆盖「营销经理」这类社媒/品牌营销岗，按标题补齐信号，避免被误判为无角色信号
  if (roleFamily.length === 1 && roleFamily[0] === '其他' && /营销|品牌|社媒|内容|公关|商务/.test(title)) {
    roleFamily = /营销|社媒|品牌/.test(title) ? ['产品营销', '市场'] : ['市场'];
  }
  const experienceKeywords = EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8);
  const preferenceTags = [
    /海外|国际|全球|global|墨西哥|越南|外派|驻外/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|多语种|小语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const sourceHash = crypto.createHash('sha1').update(String(source.baseUrl || '')).digest('hex').slice(0, 6);
  return {
    id: `topband-${sourceHash}-${positionId || crypto.createHash('sha1').update(title).digest('hex').slice(0, 12)}`,
    company: source.company || '深圳拓邦股份有限公司',
    title,
    roleFamily,
    city: cityFrom(row.workingPlace, rawTitle),
    graduationYear: '2027',
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords,
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: `${source.company || '拓邦股份'}官方校招官网(ivva)`,
    sourceType: 'official',
    sourceUrl: detailUrl(source, positionId),
    verification: '官方招聘官网/API；岗位标题标注27校招',
    publishedAt: clean(row.creatTime || row.updateTime || ''),
    deadline: '',
    description: `${source.company || '拓邦股份'}官方2027校招岗位；${functionName ? `职类：${functionName}。` : ''}${nature ? `性质：${nature}。` : ''}投递前请打开官方职位页确认最新状态。`,
    salary: extractSalary(jobText),
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: desc,
    jobRequirements: '',
    _searchText: jobText,
    _nature: nature,
    _functionName: functionName
  };
}

async function searchPage(fetcher, source, pageIndex, pageSize) {
  const base = String(source.baseUrl || 'https://campus.topband.com.cn').replace(/\/$/, '');
  const token = String(source.token || '');
  const body = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
    token,
    isSchoolRecruit: '1',
    position_recruitStatus_i: '1'
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const response = await fetcher(`${base}/companyPortal/positionSearchByPortal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json, text/plain, */*',
        'user-agent': UA,
        referer: `${base}/company/tuobang/${token}`
      },
      body: body.toString(),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`Topband API HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.success !== true) throw new Error(payload?.message || 'Topband API bad payload');
    return Array.isArray(payload.listData) ? payload.listData : [];
  } finally {
    clearTimeout(timer);
  }
}

function isInternNature(value = '') {
  return /实习|兼职|intern/i.test(String(value));
}

export async function searchTopbandJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.token) return { jobs: [], stats: { pages: 0, listed: 0, keptJobs: 0, errors: 1, snapshotComplete: false, error: 'missing token' } };
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 100), 200));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 10), 30));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 500), 1000));
  let pages = 0, listed = 0, errors = 0, internRejected = 0, relevanceRejected = 0;
  let lastError = '', snapshotComplete = false;
  const jobs = [];
  const seen = new Set();

  try {
    for (let page = 1; page <= pageLimit && seen.size < jobLimit; page++) {
      const rows = await searchPage(fetcher, source, page, size);
      pages++;
      listed += rows.length;
      for (const row of rows) {
        const id = String(row?.positionId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const job = parseTopbandJob(source, row, now);
        if (!job.title) continue;
        if (isInternNature(row.positionNature)) { internRejected++; continue; }
        if (shouldKeep(job, profile, now)) jobs.push(job);
        else relevanceRejected++;
      }
      if (rows.length < size || seen.size >= jobLimit) { snapshotComplete = true; break; }
    }
  } catch (error) {
    errors++;
    lastError = String(error?.message || error);
  }

  const emptyResult = listed === 0;
  if (emptyResult && errors === 0) { errors++; lastError = 'Topband returned zero jobs'; }
  if (emptyResult) snapshotComplete = false;

  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: { pages, listed, keptJobs: kept.length, errors, snapshotComplete, emptyResult, error: lastError, internRejected, relevanceRejected }
  };
}
