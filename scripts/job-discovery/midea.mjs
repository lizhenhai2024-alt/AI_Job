import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES, extractSalary } from './core.mjs';

// 美的集团 2027 届"美的星"校园招聘专用适配器（newpower.midea.com/schoolOut）。
// - 站点为自研 IHR 系统 SPA（Vue），岗位数据走公开 JSON API（无需鉴权）：
//   1) GET  /backend/school/position/common/project/list?status=1
//      → 返回全部招聘项目；取 numberOfSessions='2027' 且 projectType='1'（应届校招）的 projectRuleId。
//      （schoolOut 页面默认展示的是 projectType=7"校企合作实习通道"169 岗，非应届主项目，必须按 session 过滤。）
//   2) POST /backend/school/position/common/position/list
//      body { keyword:null, superiorIds:[], recruitCategoryIds:[], workPlaceCodes:[],
//             projectRuleId, pageIndex, pageSize }（服务端 pageSize 上限 20）
//      → { code:'0', data:{ data:[…], total } }；岗位含完整 JD（jobResponsibility/jobRequirement），无需详情页。
// - 响应字段：projectPositionName（岗位名）、recruitCategoryName（八大职类）、workPlaceCode（城市）、
//   projectPositionDto.{jobResponsibility,jobRequirement,positionCode}。
//
// 范围策略（用户硬约束 + AI_Job 生产池规则）：
//   * 职类白名单：供应链物流类 / 国内营销类 / 海外营销类 / 管理类。
//     研发技术类(61)/信息技术类(30)/制造技术类(17)/财务金融类(3) 不抓。
//   * 白名单职类内再按标题剔除一线销售/售前/实施/法务/技术售后：
//     销售*、*销售*、解决方案工程师、技术支持*、售后技术支持*、物流营销、国际物流营销、B端营销管培生、知识产权。
//   * 实习/非2027届由 shouldKeep 统一拦截；生产池 isOutOfScopeProfessionalRole 兜底。
const BASE = 'https://newpower.midea.com';
const LIST_API = `${BASE}/backend/school/position/common/position/list`;
const PROJECT_API = `${BASE}/backend/school/position/common/project/list?status=1`;
const CAMPUS_CITIES = [...CITY_NAMES, '无锡', '南昌', '郑州', '哈尔滨', '济南', '海口', '青岛', '大连', '沈阳', '福州', '宁波', '合肥', '石家庄', '太原', '贵阳', '昆明', '长春', '南宁', '兰州', '徐州', '常州', '南通', '烟台', '潍坊', '荆州', '安庆', '芜湖', '昆山', '邯郸', '宜春', '淮安', '嘉兴', '泰国'];
const CAMPUS_CITIES_SET = new Set(CAMPUS_CITIES);
const IN_SCOPE_CATEGORIES = new Set(['供应链物流类', '国内营销类', '海外营销类', '管理类']);
// 标题级剔除：白名单职类内的销售/售前/实施/法务/技术售后/物流营销等非在范围岗位。
const EXCLUDE_TITLE_RULES = [
  /销售/,
  /解决方案工程师/,
  /技术支持/,
  /物流营销|国际物流营销/,
  /B端营销管培生/,
  /知识产权/
];

const EXPERIENCE_WORDS = ['海外', '运营', '内容', '项目', '市场', '电商', '用户', '数据', '跨文化', '营销', '品牌', '供应链', '客户', '产品', '人力资源', '招聘', '商务', '服务', '物流'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

function cleanText(value = '') {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function stripTags(value = '') {
  return cleanText(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' '));
}

function languagesFrom(text = '') {
  return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n);
}

// 获取 2027 应届校招项目（美的星）的 projectRuleId；找不到时回退到配置值。
export async function resolveMideaRuleId(fetcher, { fallback = '', session = '2027', projectType = '1' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(PROJECT_API, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} project/list`);
    const json = await response.json();
    const projects = Array.isArray(json?.data) ? json.data : [];
    const star = projects.find((p) => String(p.numberOfSessions) === session && String(p.projectType) === String(projectType) && p.projectRuleId);
    if (star) return { ruleId: star.projectRuleId, name: star.projectRuleName, total: Number(star.number) || 0 };
    return { ruleId: fallback, name: `session ${session} project not found`, total: 0 };
  } catch (error) {
    return { ruleId: fallback, name: `resolve failed: ${error?.message || error}`, total: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// 分页拉取岗位列表；列表即含完整 JD。
export async function fetchMideaJobs(fetcher, ruleId, { pageSize = 20, maxPages = 12, maxJobs = 300 } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 20, 10), 20);
  const cap = Math.max(1, Math.min(Number(maxJobs) || 300, 500));
  const jobs = [];
  const seen = new Set();
  let total = 0;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let rows = [];
    try {
      const response = await fetcher(LIST_API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/plain, */*',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          referer: `${BASE}/schoolOut`,
          origin: BASE
        },
        body: JSON.stringify({ keyword: null, superiorIds: [], recruitCategoryIds: [], workPlaceCodes: [], projectRuleId: ruleId, pageIndex, pageSize: size }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} position/list page=${pageIndex}`);
      const json = await response.json();
      if (String(json?.code) !== '0') throw new Error(`code=${json?.code} page=${pageIndex}`);
      const data = json?.data || {};
      if (total === 0 && Number(data.total) > 0) total = Number(data.total);
      rows = Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      console.warn(`[midea] position/list page=${pageIndex} failed: ${error?.message || error}`);
      break;
    } finally {
      clearTimeout(timer);
    }
    let added = 0;
    for (const row of rows) {
      const id = String(row.positionId || row.projectPositionId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      jobs.push(row);
      added++;
    }
    if (added === 0) break;
    if (jobs.length >= (total > 0 ? Math.min(total, cap) : cap)) break;
    if (rows.length < size) break;
  }
  return { jobs, total };
}

// 城市解析：workPlaceCode 多为"佛山市"（含"市"后缀），也含"中国大陆/泰国"等。
function parseCity(row = {}) {
  const raw = String(row.workPlaceCode || '');
  const parts = raw.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return '待核';
  const found = parts.find((p) => CAMPUS_CITIES_SET.has(p) || /市$/.test(p));
  if (found) return found;
  if (parts.includes('中国大陆') || parts.includes('全国')) return '全国';
  return parts[0] || '待核';
}

export function parseMideaJob(source, row = {}, now = new Date()) {
  const dto = row.projectPositionDto || {};
  const duty = stripTags(dto.jobResponsibility || '');
  const require = stripTags(dto.jobRequirement || '');
  const jobText = [row.projectPositionName, row.recruitCategoryName, duty, require].filter(Boolean).join('\n');
  const roleFamily = classifyRole(row.projectPositionName || '');
  const skills = detectSkills(jobText);
  const preferenceTags = [
    /海外|国际|全球|global/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const riskTags = detectRisks(jobText);

  return {
    id: `midea-${crypto.createHash('sha1').update(`${BASE}|${row.positionId || row.projectPositionId}|${row.projectPositionName}`).digest('hex').slice(0, 12)}`,
    company: source.company || '美的',
    title: row.projectPositionName,
    roleFamily,
    city: parseCity(row),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: languagesFrom(jobText),
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.includes(w)).slice(0, 8),
    preferenceTags,
    riskTags,
    source: '美的官方2027校招官网',
    sourceType: 'official',
    sourceUrl: `${BASE}/schoolOut`,
    verification: source.campaignLabel ? `官方招聘官网 · 已核验${source.campaignLabel}` : '官方招聘官网 · 2027届美的星校园招聘',
    publishedAt: '',
    deadline: '',
    description: `美的官方校园招聘（2027届美的星）岗位；${row.recruitCategoryName ? `职类：${row.recruitCategoryName}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开官方职位页确认完整职责与截止日期。`,
    salary: extractSalary(jobText) || '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: duty,
    jobRequirements: require,
    _searchText: jobText,
    _sourceJobId: row.positionId || row.projectPositionId
  };
}

function emptyResult(errors = 1, message = '') {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, detailErrors: 0, snapshotComplete: false, error: message } };
}

export async function searchMideaJobs(profile, source = {}, { fetcher = fetch, maxPages, maxJobs, now = new Date() } = {}) {
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 12), 25));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 500));

  let pages = 0, listed = 0, detailed = 0, errors = 0, detailErrors = 0, snapshotComplete = false;
  const rowsByKey = new Map();
  const seen = new Set();
  let total = 0;

  // 1) 动态解析 2027 应届校招项目 ruleId（防硬编码随项目变更失效）。
  const resolved = await resolveMideaRuleId(fetcher, { fallback: source.projectRuleId || '' });
  const ruleId = resolved.ruleId;
  if (!ruleId) {
    const message = `no 2027 campus project ruleId resolved (${resolved.name}); API contract may have changed`;
    console.warn(`[midea:${source.company || '美的'}] ${message}`);
    return emptyResult(1, message);
  }

  // 2) 分页拉全量岗位。
  try {
    const { jobs, total: apiTotal } = await fetchMideaJobs(fetcher, ruleId, { pageSize: 20, maxPages: pageLimit, maxJobs: jobLimit });
    total = apiTotal || jobs.length;
    pages = Math.ceil((jobs.length || 1) / 20);
    for (const row of jobs) {
      const id = String(row.positionId || row.projectPositionId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rowsByKey.set(id, row);
      listed++;
    }
    snapshotComplete = true;
  } catch (error) {
    errors++;
    snapshotComplete = false;
  }

  if (!seen.size) {
    const message = `no positions parsed (errors=${errors}); project=${resolved.name} ruleId=${ruleId}`;
    console.warn(`[midea:${source.company || '美的'}] ${message}`);
    return emptyResult(errors, message);
  }

  // 3) 职类白名单 + 标题级剔除。
  const scopedRows = [...rowsByKey.values()].filter((row) => {
    if (!IN_SCOPE_CATEGORIES.has(row.recruitCategoryName)) return false;
    const title = String(row.projectPositionName || '');
    return !EXCLUDE_TITLE_RULES.some((rx) => rx.test(title));
  });
  const skippedScope = seen.size - scopedRows.length;
  if (skippedScope > 0) console.log(`[midea:${source.company || '美的'}] out-of-scope skipped=${skippedScope} (of listed=${seen.size})`);

  // 4) 组装岗位（列表已含完整 JD，无独立详情通道）。
  const jobs = [];
  for (const row of scopedRows) {
    if (jobs.length >= jobLimit) break;
    try {
      const job = parseMideaJob(source, row, now);
      if (!job.title) continue;
      if (shouldKeep(job, profile, now)) jobs.push(job);
    } catch { errors++; }
  }
  detailed = scopedRows.length;

  const kept = dedupeJobs(jobs);
  return {
    jobs: kept,
    stats: { pages, listed, detailed, keptJobs: kept.length, errors, detailErrors, snapshotComplete, total, skippedScope, totalDiscovered: seen.size, projectRuleId: ruleId }
  };
}
