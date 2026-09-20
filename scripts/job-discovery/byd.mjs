import crypto from 'node:crypto';
import { classifyRole, detectSkills, detectRisks, shouldKeep, dedupeJobs, CITY_NAMES } from './core.mjs';

// 比亚迪（job.byd.com）2027 校招专用适配器
// 通道1（列表）：POST /portal/api/portal-api/schoolPortal/queryPositionList，body {batch:'2027', campusNature:'008501' 应届生, pageSize, pageIndex}，无需登录
// 通道2（详情）：GET /portal/api/portal-api/schoolPortal/queryPosition?id=<id>&abroad=&degree=，返回 positionInfoList（部门/职责/要求/方向/地点/学历/外语）
// 类别树：技术[研发技术/工程技术/制造技术/技术支持]、综合[法务/公共关系/行政/投资/IT/后勤/人力资源/体系管理/财务/审计监察]、
//        运营[计划/安健环/采购/运营管理/物流/生产运营/品质]、营销[专业销售/售后服务/销售支持]

const EXPERIENCE_WORDS = ['海外','国际','运营','内容','项目','市场','用户','数据','跨文化','营销','品牌','供应链','客户','GTM','招聘','公关','传播','商务','物流','关务','翻译'];
const LANGUAGE_RULES = [
  ['英语', /英语|英文|English|CET|TEM/i], ['日语', /日语|Japanese/i], ['韩语', /韩语|Korean/i],
  ['德语', /德语|German/i], ['法语', /法语|French/i], ['西班牙语', /西语|西班牙语|Spanish/i],
  ['葡萄牙语', /葡语|葡萄牙语|Portuguese/i]
];

// 保留类别（jobType 可多值，任一分段命中即进入候选）
const KEEP_TYPES = new Set(['人力资源', '行政', '公共关系', '物流', '计划', '采购', '销售支持', '售后服务', '生产运营', '研发技术', '技术支持']);
// 标题正词（必须命中至少一个，保证方向在范围内）
const TITLE_KEEP = /市场营销|品牌营销|商务|业务运营|用户运营|传播推广|产品策略|市场研究|活动营销|新媒体营销|新媒体管理|商城运营|业务开发|业务发展|业务培训|运营管理|运营分析|订单|客诉管理|售后|服务研究|服务策略|二手车|规划管理|产品经理|项目主管|翻译|宣传|外事|媒介|关务|物流|调度|供应链|资源开发|核价|计划|物控|产能规划|备件|人力资源|招聘|绩效|员工关系|组织|培训|人才发展|薪酬|效能|国际人力|市场专员|渠道开发/;
// 标题反词（强技术/工程/财务法务/纯销售/杂务）
const EXCLUDE_TITLE = /结构|软件|硬件|机械|算法|工艺|模具|设备|试验|测试|认证|失效|仿真|电气|电子|材料|电芯|NVH|CAE|CFD|线束|车身|底盘|动力|电机|热管理|制冷|包装|尺寸|色彩|界面|视觉|工业设计|质量|品质|体系|ESG|法务|律师|专利|财务|会计|税务|审计|内控|融资|资金|外汇|客服|索赔|审核|同步|巡检|网络安全|机器人|编程|自动化|数据管理|档案管理|监印|资产管理|接待|干部管理|考核|销售经理|销售专员|销售运营|销售管理|销售研究|销售分析|影像师|项目工程师|项目专员|技术标准|标准情报|法规认证|车型成本|价值创新|失效分析|标准法规|测试开发|体系工程/;

function clean(value = '') {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function citiesFrom(workPlace = '') {
  const names = String(workPlace || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const uniq = [];
  for (const n of names) {
    const bare = n.replace(/市$/, '');
    const matched = CITY_NAMES.includes(n) ? n : (CITY_NAMES.includes(bare) ? bare : '');
    if (matched && !uniq.includes(matched)) uniq.push(matched);
  }
  return uniq.length ? uniq : ['待核'];
}
function languagesFrom(text) { return LANGUAGE_RULES.filter(([, rx]) => rx.test(text)).map(([n]) => n); }

export function parseBydJob(source, row = {}, details = [], now = new Date()) {
  const rawId = String(row.id || '');
  const title = clean(row.jobName || '');
  const jobType = clean(row.jobType || '');
  // 合并详情变体（部门/职责/要求/方向）
  const dutyParts = [], reqParts = [], dirs = [], divs = [], cities = [], langs = new Set();
  for (const d of details) {
    const duty = clean(d.jobDuty || '');
    const req = clean(d.jobRequirements || '');
    const dir = clean(d.researchDirection || '');
    const div = clean(d.division || '');
    if (duty) dutyParts.push(duty);
    if (req) reqParts.push(req);
    if (dir && !dirs.includes(dir)) dirs.push(dir);
    if (div && !divs.includes(div)) divs.push(div);
    const cs = citiesFrom(d.workPlace);
    for (const c of cs) if (c !== '待核' && !cities.includes(c)) cities.push(c);
    for (const l of languagesFrom(`${duty} ${req}`)) langs.add(l);
  }
  if (!cities.length) cities.push(...citiesFrom(row.workPlace).filter(c => c !== '待核'));
  if (!cities.length) cities.push('待核');
  const jobText = [title, jobType, dirs.join('、'), divs.join('、'), dutyParts.join('\n'), reqParts.join('\n')].filter(Boolean).join('\n');
  const skills = detectSkills(jobText);
  const roleFamily = classifyRole(title);
  const preferenceTags = [
    /海外|国际|全球|global|外派|跨国/i.test(jobText) ? '国际业务' : '',
    /跨文化|本地化|海外用户|海外市场|多语种|翻译/i.test(jobText) ? '跨文化' : '',
    /出海|海外市场|跨境/i.test(jobText) ? '出海' : ''
  ].filter(Boolean);
  const updateTime = String(row.updateTime || '');
  return {
    id: `byd-${crypto.createHash('sha1').update(`${rawId}|${title}`).digest('hex').slice(0, 12)}`,
    company: source.company || '比亚迪',
    title,
    roleFamily,
    city: cities.join('、'),
    graduationYear: String(source.graduationYear || '2027'),
    skills,
    languages: [...langs],
    experienceKeywords: EXPERIENCE_WORDS.filter((w) => jobText.toLowerCase().includes(w.toLowerCase())).slice(0, 8),
    preferenceTags,
    riskTags: detectRisks(jobText),
    source: '比亚迪2027届校园招聘官网',
    sourceType: 'official',
    sourceUrl: source.url || 'https://job.byd.com/portal/pc/#/school/schoolPositionList',
    verification: '官方招聘官网/API',
    publishedAt: updateTime,
    deadline: '',
    description: `比亚迪2027届校园招聘岗位；${jobType ? `类别：${jobType}。` : ''}${dirs.length ? `方向：${dirs.join('、')}。` : ''}${divs.length ? `部门：${divs.slice(0, 3).join('、')}。` : ''}${cities.length ? `工作地：${cities.join('、')}。` : ''}${[...langs].length ? `语言要求：${[...langs].join('、')}。` : ''}${skills.length ? `识别关键词：${skills.slice(0, 5).join('、')}。` : ''}投递前请打开比亚迪校招页确认最新状态。`,
    salary: '',
    status: '推荐',
    discoveredAt: now.toISOString(),
    jobDescription: dutyParts.join('\n'),
    jobRequirements: reqParts.join('\n'),
    _searchText: jobText,
    _sourceJobId: rawId
  };
}

function emptyResult(errors = 1) {
  return { jobs: [], stats: { pages: 0, listed: 0, detailed: 0, keptJobs: 0, errors, snapshotComplete: false } };
}

async function fetchPage(fetcher, pageIndex, pageSize) {
  const base = 'https://job.byd.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(`${base}/portal/api/portal-api/schoolPortal/queryPositionList`, {
      method: 'POST',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'content-type': 'application/json', accept: 'application/json, text/plain, */*',
        origin: base, referer: `${base}/portal/pc/`
      },
      body: JSON.stringify({ topicCode: '', batch: '2027', campusNature: '008501', abroad: '', degree: '', jobType: [], researchDirection: [], workPlace: [], keywords: '', pageSize, pageIndex }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`BYD API HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 0 || !Array.isArray(payload?.data)) throw new Error('bad BYD list payload');
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDetail(fetcher, id) {
  const base = 'https://job.byd.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(`${base}/portal/api/portal-api/schoolPortal/queryPosition?id=${encodeURIComponent(id)}&abroad=&degree=`, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        accept: 'application/json, text/plain, */*', referer: `${base}/portal/pc/`
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`BYD detail HTTP ${response.status}`);
    const payload = await response.json();
    return payload?.code === 0 && payload?.data ? payload.data : null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldKeepJob(row, profile, now) {
  const title = clean(row.jobName || '');
  const types = String(row.jobType || '').split(',').map(t => t.trim());
  if (!types.some(t => KEEP_TYPES.has(t))) return false;
  if (!TITLE_KEEP.test(title)) return false;
  if (EXCLUDE_TITLE.test(title)) return false;
  return true;
}

export async function searchBydJobs(profile, source, { fetcher = fetch, maxJobs, pageSize, maxPages, now = new Date() } = {}) {
  if (!source?.url) return emptyResult();
  const size = Math.max(1, Math.min(Number(pageSize || source.pageSize || 100), 100));
  const pageLimit = Math.max(1, Math.min(Number(maxPages || source.maxPages || 10), 30));
  const jobLimit = Math.max(1, Math.min(Number(maxJobs || source.maxJobs || 300), 600));

  let pages = 0, listed = 0, errors = 0, snapshotComplete = false;
  const keptRows = [];

  try {
    while (pages < pageLimit && keptRows.length < jobLimit) {
      const payload = await fetchPage(fetcher, pages + 1, size);
      pages++;
      const rows = Array.isArray(payload.data) ? payload.data : [];
      listed += rows.length;
      for (const row of rows) {
        if (shouldKeepJob(row, profile, now)) keptRows.push(row);
        if (keptRows.length >= jobLimit) break;
      }
      if (rows.length < size) break;
    }
    snapshotComplete = true;
  } catch (e) {
    errors++;
    console.warn(`[byd] list error: ${e.message}`);
  }

  // 详情抓取（并发 4）
  const jobs = [];
  const seen = new Set();
  for (let i = 0; i < keptRows.length; i += 4) {
    const batch = keptRows.slice(i, i + 4);
    const detailResults = await Promise.all(batch.map(async (row) => {
      try { return await fetchDetail(fetcher, String(row.id)); } catch { return null; }
    }));
    batch.forEach((row, idx) => {
      const id = String(row.id || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      try {
        const job = parseBydJob(source, row, Array.isArray(detailResults[idx]?.positionInfoList) ? detailResults[idx].positionInfoList : [], now);
        if (!job.title) return;
        if (job.riskTags?.includes('纯销售')) return;
        if (shouldKeep(job, profile, now)) jobs.push(job);
      } catch { errors++; }
    });
  }

  const kept = dedupeJobs(jobs);
  return { jobs: kept, stats: { pages, listed, detailed: seen.size, keptJobs: kept.length, errors, snapshotComplete } };
}
