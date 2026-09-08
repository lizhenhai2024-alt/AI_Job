import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

const EXPERIENCE_WORDS = ['海外','运营','内容','项目','市场','电商','用户','数据','跨文化','营销','品牌','供应链','客户','咨询','沟通','分析'];
const SHORT_2027_RX = /(?:^|[^0-9])27\s*届(?:毕业生|校招|秋招|应届)?/i;
const CAMPUS_2027_RX = /2027\s*届|Campus\s*2027|2027\s*Campus|27\s*届/i;
const INTERNSHIP_RX = /实习|\bIntern(?:ship)?\b/i;
const PURE_SALES_RX = /销售管培生|销售代表|销售专员|销售顾问|销售经理|海外销售|国际销售|渠道销售|区域销售|大客户销售/i;
const NON_PURE_SALES_RX = /销售运营|销售支持|销售分析|销售策略|销售计划|销售管理|商务运营/i;

function clean(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(value = '') {
  const m = String(value || '').match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

function tenantOf(source = {}) {
  return String(source.tenant || '').replace(/^SU/i, '');
}

function tenantKey(source = {}) {
  const tenant = tenantOf(source);
  return tenant ? `SU${tenant}` : '';
}

function baseOf(source = {}) {
  return String(source.baseUrl || 'https://wecruit.hotjob.cn').replace(/\/$/, '');
}

function pageUrl(source = {}) {
  const base = baseOf(source);
  return source.url || `${base}/${tenantKey(source)}/pb/school.html`;
}

function apiUrl(source = {}, action = 'listPosition') {
  const base = baseOf(source);
  return `${base}/wecruit/positionInfo/${action}/${tenantKey(source)}?iSaJAx=isAjax&request_locale=zh_CN&t=${Date.now()}`;
}

function apiHeaders(source = {}) {
  const base = baseOf(source);
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    referer: pageUrl(source),
    origin: base
  };
}

async function postForm(fetcher, source, action, data) {
  const response = await fetcher(apiUrl(source, action), {
    method: 'POST',
    headers: apiHeaders(source),
    body: new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)])).toString()
  });
  if (!response.ok) throw new Error(`HotJob HTTP ${response.status} ${action} for ${source.company}`);
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error(`HotJob non-JSON ${action} response for ${source.company}`); }
  if (String(payload?.state) !== '200') throw new Error(payload?.msg || `HotJob ${action} state=${payload?.state} for ${source.company}`);
  return payload.data || {};
}

async function fetchListPage(fetcher, source, currentPage) {
  const data = await postForm(fetcher, source, 'listPosition', {
    isFrompb: true,
    recruitType: 1,
    pageSize: Number(source.pageSize || 20),
    currentPage
  });
  const pageForm = data.pageForm || {};
  return {
    rows: Array.isArray(pageForm.pageData) ? pageForm.pageData : [],
    totalPage: Number(pageForm.totalPage || 0),
    totalPositions: Number(data.positonNum || pageForm.dataCount || 0)
  };
}

async function fetchDetail(fetcher, source, postId) {
  return postForm(fetcher, source, 'listPositionDetail', { postId });
}

function roleFamilyFrom(title = '') {
  const family = classifyRole(title);
  if (family.length === 1 && family[0] === '其他' && /咨询|顾问|Consulting|Advisory/i.test(title)) return ['咨询'];
  return family;
}

function cityFrom(text = '') {
  const raw = clean(text);
  const city = CITY_NAMES.find((name) => raw.includes(name));
  return city || raw || '待核';
}

function has2027Evidence(row = {}, detail = {}) {
  const evidence = [row.projectName, row.postName, detail.projectName, detail.postName, detail.workContent, detail.serviceCondition]
    .filter(Boolean).join('\n');
  return CAMPUS_2027_RX.test(evidence) || SHORT_2027_RX.test(evidence);
}

function isListCandidate(row = {}, profile = {}) {
  const title = clean(row.postName || '');
  if (!title || INTERNSHIP_RX.test(`${title} ${row.workTypeStr || ''} ${row.projectName || ''}`)) return false;
  if (PURE_SALES_RX.test(title) && !NON_PURE_SALES_RX.test(title)) return false;
  if (!has2027Evidence(row, {})) return false;
  const roleFamily = roleFamilyFrom(title);
  const rough = {
    title,
    company: clean(row.company || ''),
    city: cityFrom(row.workPlaceStr || row.department || ''),
    graduationYear: '2027',
    roleFamily,
    skills: detectSkills(`${title} ${row.postTypeName || ''} ${row.projectName || ''}`),
    _searchText: [title, row.postTypeName, row.company, row.department, row.projectName].filter(Boolean).join(' '),
    deadline: normalizeDate(row.endDate),
    closed: false
  };
  return shouldKeep(rough, profile, new Date());
}

export function parseHotjobDetail(source, row = {}, detail = {}, now = new Date()) {
  const postId = String(detail.postId || row.postId || '');
  const title = clean(detail.postName || row.postName || '');
  const projectName = clean(detail.projectName || row.projectName || '');
  const workContent = clean(detail.workContent || '');
  const requirements = clean(detail.serviceCondition || detail.applyPositionContent || '');
  const category = clean(detail.postTypeName || row.postTypeName || '');
  const org = clean(detail.orgName || detail.company || row.company || '');
  const jobText = [title, projectName, category, org, workContent, requirements].filter(Boolean).join('\n');
  const graduationYear = has2027Evidence(row, detail) ? '2027' : '';
  const roleFamily = roleFamilyFrom(title);
  const skills = detectSkills(jobText);
  const experienceKeywords = EXPERIENCE_WORDS.filter((word) => jobText.toLowerCase().includes(word.toLowerCase())).slice(0, 10);
  const preferenceTags = [
    /海外|国际|全球|Global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场/i.test(jobText) ? '跨文化' : '',
    /咨询|Consulting|Advisory/i.test(jobText) ? '咨询' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);
  const base = baseOf(source);
  const sourceUrl = `${base}/${tenantKey(source)}/pb/posDetail.html?postId=${encodeURIComponent(postId)}&postType=campus`;
  const publishedAt = normalizeDate(detail.publishDate || detail.publishFirstDate || row.publishDate || row.publishFirstDate);
  const deadline = normalizeDate(detail.endDate || row.endDate);
  const salary = clean(detail.salaryStr || detail.salary || '');
  return {
    id: `hotjob-${crypto.createHash('sha1').update(`${tenantKey(source)}|${postId}`).digest('hex').slice(0, 12)}`,
    company: source.company,
    title,
    roleFamily,
    city: cityFrom(detail.workPlaceStr || row.workPlaceStr || detail.department || row.department || ''),
    graduationYear,
    skills,
    languages: /英语|英文|English|CET|TOEFL|IELTS/i.test(jobText) ? ['英语'] : [],
    experienceKeywords,
    preferenceTags,
    riskTags,
    source: '公司官方HotJob校招官网',
    sourceType: 'official',
    sourceUrl,
    verification: graduationYear ? `官方HotJob校招 · 项目明确${projectName || '2027届'}` : '官方HotJob校招 · 未识别2027届证据',
    publishedAt,
    deadline,
    description: `公司官方 HotJob 校招岗位；已读取完整职位职责与任职要求并进入四步 JD 筛选。`,
    salary,
    status: '推荐',
    discoveredAt: now.toISOString(),
    _searchText: jobText,
    _recruitType: clean(detail.workTypeStr || row.workTypeStr || '全职'),
    _subject: projectName,
    _sourceJobId: postId
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return out;
}

export async function searchHotjobJobs(profile, sources = [], { fetcher = fetch, now = new Date(), concurrency = 5 } = {}) {
  const jobs = [];
  const perPortal = {};
  let scannedPortals = 0, listed = 0, detailed = 0, errors = 0;

  for (const source of sources) {
    let portalListed = 0, portalDetailed = 0, portalKept = 0, detailErrors = 0, totalPositions = 0;
    try {
      if (!source.company || !tenantOf(source)) throw new Error('HotJob source requires company and tenant');
      const first = await fetchListPage(fetcher, source, 1);
      scannedPortals++;
      totalPositions = first.totalPositions;
      const maxPages = Math.max(1, Math.min(Number(source.maxPages || 300), 500));
      const totalPages = Math.max(1, Math.min(first.totalPage || 1, maxPages));
      const pages = [first];
      if (totalPages > 1) {
        const indexes = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
        const rest = await mapLimit(indexes, Number(source.listConcurrency || concurrency), async (page) => fetchListPage(fetcher, source, page));
        pages.push(...rest);
      }
      const rowMap = new Map();
      for (const page of pages) {
        for (const row of page.rows || []) {
          const id = String(row.postId || '');
          if (id && !rowMap.has(id)) rowMap.set(id, row);
        }
      }
      const rows = [...rowMap.values()];
      portalListed = rows.length;
      listed += rows.length;
      const candidates = rows.filter((row) => isListCandidate(row, profile)).slice(0, Number(source.maxDetails || 120));
      const normalized = await mapLimit(candidates, Number(source.detailConcurrency || concurrency), async (row) => {
        try {
          const detail = await fetchDetail(fetcher, source, row.postId);
          portalDetailed++; detailed++;
          const job = parseHotjobDetail(source, row, detail, now);
          return shouldKeep(job, profile, now) ? job : null;
        } catch {
          detailErrors++;
          return null;
        }
      });
      const portalJobs = dedupeJobs(normalized.filter(Boolean));
      portalKept = portalJobs.length;
      jobs.push(...portalJobs);
      perPortal[source.company] = {
        totalPositions,
        listed: portalListed,
        detailed: portalDetailed,
        keptJobs: portalKept,
        detailErrors,
        totalPages
      };
    } catch (error) {
      errors++;
      perPortal[source.company] = {
        totalPositions,
        listed: portalListed,
        detailed: portalDetailed,
        keptJobs: portalKept,
        detailErrors,
        error: String(error?.message || error)
      };
    }
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { portals: sources.length, scannedPortals, listed, detailed, keptJobs: kept.length, errors, perPortal } };
}
