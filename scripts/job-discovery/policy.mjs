function textOf(job = {}) {
  return [job?.title, job?._searchText, job?.description]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ');
}

export function isInternshipJob(job = {}) {
  const title = String(job?.title || '');
  return /实习生|日常实习|暑期实习|实习岗位|\bIntern(?:ship)?\b/i.test(title);
}

export function isEngineeringOrImplementationJob(job = {}) {
  const title = String(job?.title || '');
  return /工程师|实施/.test(title);
}

const STEM_RX = /理工科|工科|理科|计算机|软件工程|电子信息|电子工程|自动化|机械|电气|通信|数学|统计|物理|化学|材料|车辆工程|能源|控制工程|人工智能|数据科学/i;
const PREFERRED_RX = /优先|优先考虑|加分项|加分|preferred|plus/i;
const FLEXIBLE_RX = /专业不限|不限专业|专业不限制|不限制专业|统招本硕不限|本硕不限/i;
const MANDATORY_RX = /必须|要求|限|仅限|需具备|需要具备|专业要求|相关专业|专业背景|应为|须为|本科.*专业|硕士.*专业/i;
const ENGLISH_FRIENDLY_MAJOR_RX = /英语|外语|语言|文学|人文|文科|新闻传播|传播学|中文|汉语言|专业不限|不限专业/i;
const MAJOR_LIST_RX = /市场营销|新闻传播|广告|商科|工商管理|经济|金融|管理|理工科|工科|计算机|电子|自动化|数学|统计|数据科学|信息管理/i;
const TECH_TERM_RX = /模型理论|大模型|\bAgent\b|智能体|\bSQL\b|\bPython\b|编程|代码|数据建模|算法|机器学习|深度学习|数据库|数据结构/i;
const TECH_MANDATORY_RX = /深刻理解|深入理解|熟练掌握|熟练使用|精通|必须|要求|具备.{0,10}(能力|经验)|能够独立|需掌握|需要掌握/i;
const CERT_RX = /\bCPA\b|注册会计师|\bCFA\b|特许金融分析师|精算师|法律职业资格|法考|律师资格/i;
const CERT_MANDATORY_RX = /必须|要求|须|需|持有|取得|通过|具备/i;
const RELATED_MASTER_RX = /(相关专业.{0,12}硕士.{0,12}优先|硕士.{0,12}相关专业.{0,12}优先|相关学科.{0,12}硕士.{0,12}优先)/i;
const FRIENDLY_SIGNAL_RULES = [
  ['专业不限', FLEXIBLE_RX],
  ['沟通协调', /沟通协调|协调沟通|跨部门|部门协同|多方协同/i],
  ['资料整理', /资料整理|信息整理|文档整理|材料整理|台账/i],
  ['翻译/本地化', /翻译|校对|本地化|双语|英文资料/i],
  ['客户沟通', /客户接待|客户沟通|客户对接|客户服务/i],
  ['国际业务', /国际业务|海外业务|海外市场|全球业务|出海|跨文化/i]
];

function splitRequirementClauses(text = '') {
  return String(text)
    .split(/[。；;\n]|(?=\d+[.、])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requiresMandatoryStem(job = {}) {
  const text = textOf(job);
  if (!STEM_RX.test(text)) return false;

  for (const clause of splitRequirementClauses(text)) {
    if (!STEM_RX.test(clause)) continue;
    if (PREFERRED_RX.test(clause) || FLEXIBLE_RX.test(clause)) continue;
    if (MANDATORY_RX.test(clause)) return true;
  }
  return false;
}

export function requiresHardTechnicalAbility(job = {}) {
  for (const clause of splitRequirementClauses(textOf(job))) {
    if (!TECH_TERM_RX.test(clause)) continue;
    if (PREFERRED_RX.test(clause) && !TECH_MANDATORY_RX.test(clause.replace(PREFERRED_RX, ''))) continue;
    if (TECH_MANDATORY_RX.test(clause)) return true;
    const hits = clause.match(new RegExp(TECH_TERM_RX.source, 'gi')) || [];
    if (hits.length >= 3) return true;
  }
  return false;
}

export function requiresProfessionalCertificate(job = {}) {
  for (const clause of splitRequirementClauses(textOf(job))) {
    if (!CERT_RX.test(clause)) continue;
    if (PREFERRED_RX.test(clause) && !CERT_MANDATORY_RX.test(clause.replace(PREFERRED_RX, ''))) continue;
    if (CERT_MANDATORY_RX.test(clause)) return true;
  }
  return false;
}

export function analyzeCandidateFit(job = {}) {
  const text = textOf(job);
  const warnings = [];
  const strengths = [];

  for (const clause of splitRequirementClauses(text)) {
    if (PREFERRED_RX.test(clause) && MAJOR_LIST_RX.test(clause) && !ENGLISH_FRIENDLY_MAJOR_RX.test(clause) && !FLEXIBLE_RX.test(clause)) {
      warnings.push('专业背景不占优');
    }
    if (PREFERRED_RX.test(clause) && TECH_TERM_RX.test(clause) && !TECH_MANDATORY_RX.test(clause.replace(PREFERRED_RX, ''))) {
      warnings.push('技术背景优先');
    }
    if (RELATED_MASTER_RX.test(clause)) warnings.push('相关专业硕士优先');
    if (PREFERRED_RX.test(clause) && CERT_RX.test(clause) && !CERT_MANDATORY_RX.test(clause.replace(PREFERRED_RX, ''))) {
      warnings.push('专业证书优先');
    }
  }

  for (const [label, rx] of FRIENDLY_SIGNAL_RULES) if (rx.test(text)) strengths.push(label);

  const uniqueWarnings = [...new Set(warnings)];
  const uniqueStrengths = [...new Set(strengths)];
  const penaltyMap = { '专业背景不占优': 10, '技术背景优先': 8, '相关专业硕士优先': 8, '专业证书优先': 6 };
  const penalty = Math.min(22, uniqueWarnings.reduce((sum, item) => sum + (penaltyMap[item] || 0), 0));
  const bonus = Math.min(8, uniqueStrengths.length * 2);
  return { warnings: uniqueWarnings, strengths: uniqueStrengths, penalty, bonus };
}

export function jobPolicyReasons(job = {}) {
  const reasons = [];
  if (isInternshipJob(job)) reasons.push('实习岗位');
  if (isEngineeringOrImplementationJob(job)) reasons.push('工程师/实施岗位');
  if (requiresMandatoryStem(job)) reasons.push('必须理工科/技术专业');
  if (requiresHardTechnicalAbility(job)) reasons.push('硬技术能力要求');
  if (requiresProfessionalCertificate(job)) reasons.push('必须专业资格证书');
  if (job?.riskTags?.includes('纯销售')) reasons.push('纯销售');
  return reasons;
}

export function shouldExcludeByPolicy(job = {}) {
  return jobPolicyReasons(job).length > 0;
}

export function enrichCandidateFit(job = {}) {
  const fit = analyzeCandidateFit(job);
  return {
    ...job,
    candidateFit: fit,
    riskTags: [...new Set([...(job.riskTags || []), ...fit.warnings.map((item) => `适配风险：${item}`)])],
    preferenceTags: [...new Set([...(job.preferenceTags || []), ...fit.strengths])]
  };
}
