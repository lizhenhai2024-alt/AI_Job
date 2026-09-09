// Normalize scraped campus-recruitment records to the concrete job granularity verified from official sources.
const ROLE_WORDS = /运营|销售|跟单|采购|物流|市场|营销|财务|会计|人力|招聘|计划|供应链|客服|商务|项目|产品|品牌|管培|经理|专员|工程师|管理/;
const MAJOR_WORDS = /外语|国贸|国际经济与贸易|英语|翻译|小语种|机械|材料|经管|工商管理|市场营销|专业|学科|类/;
const COHORT_WORDS = /20\d{2}\s*届|校招|应届/;
const FUYAO_COMPANY = /福耀(?:集团|玻璃)?|福耀玻璃工业集团/;

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function qualificationSuffix(title = '') {
  const match = String(title).trim().match(/^(.*?)[（(]([^（）()]{2,100})[）)]\s*$/u);
  if (!match) return null;
  const base = match[1].trim();
  const suffix = match[2].trim();
  if (!base || !COHORT_WORDS.test(suffix) || !MAJOR_WORDS.test(suffix)) return null;
  // A suffix containing an actual role name is not merely a qualification block.
  if (ROLE_WORDS.test(suffix.replace(/专业|学科|类/g, ''))) return null;
  return { base, suffix };
}

export function separateTitleFromQualifications(job = {}) {
  const parsed = qualificationSuffix(job.title || '');
  if (!parsed) return { ...job };
  const hints = parsed.suffix
    .replace(/20\d{2}\s*届|校招|应届|本科(?:及以上)?|硕士(?:及以上)?/g, ' ')
    .split(/[、/，,；;|+]/)
    .map((item) => item.trim())
    .filter((item) => item && MAJOR_WORDS.test(item));
  return {
    ...job,
    title: parsed.base,
    majorRequirements: uniq([...(job.majorRequirements || []), ...hints]),
    granularityNotes: uniq([...(job.granularityNotes || []), '岗位名称已与届别/专业要求分离'])
  };
}

export function isHighConfidenceMergedPosting(job = {}) {
  if (job.sourceType === 'official') return false;
  const title = String(job.title || '').trim();
  if (!title) return false;
  if (/岗位汇总|岗位合集|岗位概览|多岗位|若干岗位|招聘岗位一览|岗位方向汇总/.test(title)) return true;
  const parts = title.split(/[、/|+；;]/).map((part) => part.trim()).filter(Boolean);
  const roleParts = parts.filter((part) => ROLE_WORDS.test(part));
  return parts.length >= 3 && roleParts.length >= 2;
}

function fuyaoSalesFollowup(job) {
  const officialUrl = 'https://job.fuyaogroup.com/';
  const base = {
    ...job,
    title: '销售跟单-2027届校招',
    roleFamily: uniq(['业务运营', ...(job.roleFamily || []).filter((role) => role !== '其他')]),
    skills: uniq(['英语', ...(job.skills || [])]),
    languages: uniq(['英语', ...(job.languages || [])]),
    experienceKeywords: uniq(['客户', '供应链', '数据', ...(job.experienceKeywords || [])]),
    preferenceTags: uniq(['国际业务', ...(job.preferenceTags || [])]),
    majorRequirements: ['外语类', '国贸类', '机械类', '材料类'],
    educationRequirement: '本科及以上',
    source: '福耀集团官方校园招聘（官网核验）',
    sourceType: 'official',
    sourceUrl: officialUrl,
    verification: '已按福耀集团2027届校招核验岗位名、专业要求与工作地点；投递以官方校园招聘实时职位页为准',
    description: '岗位职责：负责产品订单下达、跟踪、发运；负责日常客户服务，并跟进量产客户交付、回款、库存及部门报表统计分析。岗位要求：专业要求为外语类、国贸类、机械类、材料类等；学历要求本科及以上。',
    officialEvidence: {
      verifiedAt: '2026-09-09',
      campaign: '福耀集团2027届校园招聘',
      roleName: '销售跟单',
      locations: ['福清', '合肥'],
      majorRequirements: ['外语类', '国贸类', '机械类', '材料类']
    },
    granularityStatus: 'officially_resolved',
    granularityNotes: uniq([...(job.granularityNotes || []), '官方核验后按工作地点拆分为独立岗位卡片'])
  };
  return ['福清', '合肥'].map((city) => ({
    ...base,
    id: `${job.id}-fuyao-sales-followup-${city === '福清' ? 'fuqing' : 'hefei'}`,
    title: `${base.title}-${city}`,
    city,
    _searchText: `${base.title} ${city} 专业要求 外语类 国贸类 机械类 材料类 英语 订单 交付 回款 库存 客户 数据`
  }));
}

export function curatedOfficialGranularityJobs() {
  return fuyaoSalesFollowup({
    id: 'verified-fuyao-sales-followup-2027',
    company: '福耀玻璃',
    title: '销售跟单',
    graduationYear: '2027',
    roleFamily: ['业务运营'],
    skills: ['英语'],
    languages: ['英语'],
    experienceKeywords: ['客户', '供应链', '数据'],
    preferenceTags: ['国际业务'],
    riskTags: [],
    publishedAt: '2026-09-02',
    deadline: '2027-03-01',
    salary: '',
    status: '推荐',
    discoveredAt: '2026-09-09T00:00:00.000Z'
  });
}

function resolveKnownOfficialPosting(job) {
  if (job.graduationYear !== '2027' || !FUYAO_COMPANY.test(String(job.company || ''))) return null;
  if (/销售跟单/.test(String(job.title || ''))) return fuyaoSalesFollowup(job);
  return null;
}

export function curateJobGranularity(job = {}) {
  const normalized = separateTitleFromQualifications(job);
  const resolved = resolveKnownOfficialPosting(normalized);
  if (resolved) return resolved;
  if (isHighConfidenceMergedPosting(normalized)) {
    return [{
      ...normalized,
      granularityStatus: 'needs_official_resolution',
      excludeFromLiveBoard: true,
      granularityNotes: uniq([...(normalized.granularityNotes || []), '高置信度多岗位合并记录：未完成官网逐岗位核验前不进入机会看板'])
    }];
  }
  return [normalized];
}

export function curateDiscoveredJobs(jobs = []) {
  return jobs.flatMap((job) => curateJobGranularity(job));
}
