// Normalize scraped campus-recruitment records to concrete job granularity without
// inventing current jobs from historical/manual verification snapshots.
const ROLE_WORDS = /运营|销售|跟单|采购|物流|市场|营销|财务|会计|人力|招聘|计划|供应链|客服|商务|项目|产品|品牌|管培|经理|专员|工程师|管理/;
const MAJOR_WORDS = /外语|国贸|国际经济与贸易|英语|翻译|小语种|机械|材料|经管|工商管理|市场营销|专业|学科|类/;
const COHORT_WORDS = /20\d{2}\s*届|校招|应届/;

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
  const title = String(job.title || '').trim();
  if (!title) return false;
  if (/岗位汇总|岗位合集|岗位概览|多岗位|若干岗位|招聘岗位一览|岗位方向汇总/.test(title)) return true;
  const parts = title.split(/[、/|+；;]/).map((part) => part.trim()).filter(Boolean);
  const roleParts = parts.filter((part) => ROLE_WORDS.test(part));
  return parts.length >= 3 && roleParts.length >= 2;
}

// Compatibility export retained for callers. Current production jobs must come
// from a live discovery source or an explicit data file with freshness evidence;
// source code must not synthesize deterministic job cards.
export function curatedOfficialGranularityJobs() {
  return [];
}

export function curateJobGranularity(job = {}) {
  const normalized = separateTitleFromQualifications(job);
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
