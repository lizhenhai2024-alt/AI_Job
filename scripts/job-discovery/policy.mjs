function rawTextOf(job = {}) {
  return [job?.title, job?._searchText, job?.description]
    .filter(Boolean)
    .join('\n')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function textOf(job = {}) {
  return rawTextOf(job).replace(/\s+/g, ' ');
}

export function isInternshipJob(job = {}) {
  const title = String(job?.title || '');
  return /实习生|日常实习|暑期实习|实习岗位|\bIntern(?:ship)?\b/i.test(title);
}

const UNAMBIGUOUS_TECH_ENGINEER_RX = /研发工程师|算法工程师|软件工程师|硬件工程师|结构工程师|机械工程师|电气工程师|电子工程师|测试工程师|质量工程师|工艺工程师|系统工程师|数据工程师|开发工程师/i;
export function isEngineeringOrImplementationJob(job = {}) {
  const title = String(job?.title || '');
  return /实施/.test(title) || UNAMBIGUOUS_TECH_ENGINEER_RX.test(title);
}

const STEM_RX = /理工科|工科|理科|计算机|软件工程|电子信息|电子工程|自动化|机械|电气|通信|数学|统计|物理|化学|材料|车辆工程|能源|控制工程|人工智能|数据科学/i;
const LANGUAGE_MAJOR_RX = /英语|商务英语|外语|外国语言|语言类|翻译/i;
const BROAD_SOCIAL_RX = /国际贸易|国际商务|国际经济|法律|法学|经济管理|经济学|贸易|商务管理/i;
const MARKET_BUSINESS_RX = /市场营销|新闻传播|传播学|广告|商科|工商管理|金融|会计|财务|信息管理/i;
const PREFERRED_RX = /优先|优先考虑|加分项|加分|preferred|plus/i;
const FLEXIBLE_RX = /专业不限|不限专业|专业不限制|不限制专业|统招本硕不限|本硕不限/i;
const MANDATORY_RX = /必须|要求|限|仅限|需具备|需要具备|专业要求|相关专业|专业背景|应为|须为|本科.*专业|硕士.*专业/i;
const MAJOR_CONTEXT_RX = /专业|学科|背景|本科|硕士/i;
const TECH_TERM_RX = /模型理论|大模型|\bAgent\b|智能体|\bSQL\b|\bPython\b|编程|代码|数据建模|算法|机器学习|深度学习|数据库|数据结构|机械原理|机械结构|液压原理|电气原理|控制理论/i;
const TECH_MANDATORY_RX = /深刻理解|深入理解|熟练掌握|熟练使用|精通|必须|要求|具备.{0,10}(能力|经验)|能够独立|需掌握|需要掌握|熟悉/i;
const CERT_RX = /\bCPA\b|注册会计师|\bCFA\b|特许金融分析师|精算师|法律职业资格|法考|律师资格/i;
const CERT_MANDATORY_RX = /必须|要求|须|需|持有|取得|通过|具备/i;
const RELATED_MASTER_RX = /(相关专业.{0,12}硕士.{0,12}优先|硕士.{0,12}相关专业.{0,12}优先|相关学科.{0,12}硕士.{0,12}优先)/i;

const TECH_DUTY_RULES = [
  ['问题根因', /识别.{0,8}问题根因|判断.{0,8}问题根因|根因分析|故障诊断/i],
  ['技术评估', /技术评估|技术方案|技术验证|技术分析/i],
  ['质量技术', /质量方案|质量分析|质量改进|质量问题/i],
  ['结构/原理', /结构设计|结构分析|机械原理|机械结构|电气原理|控制原理/i],
  ['模型/算法', /模型设计|模型训练|算法设计|算法开发|数据建模|机器学习|深度学习|\bAgent\b/i],
  ['开发实现', /开发实现|编写代码|程序开发|系统开发|软件开发|硬件开发/i]
];

const BUSINESS_DUTY_RULES = [
  ['商务测算', /商务测算|报价测算|商务分析|商业测算/i],
  ['合同', /合同起草|合同审核|合同管理|合同谈判/i],
  ['跨文化沟通', /跨文化沟通|海外沟通|英文沟通|跨部门沟通|沟通协调/i],
  ['客户关系', /维护客户关系|客户维护|客户沟通|客户对接|客户接待/i],
  ['物流执行', /订舱|清关|报关|单证|物流跟踪|货代|出货/i],
  ['资料/流程', /资料整理|信息整理|文档整理|存档|流程执行|流程跟进/i],
  ['翻译/本地化', /翻译|校对|本地化|双语|英文资料/i],
  ['国际业务', /国际业务|海外业务|海外市场|全球业务|跨境业务|出海/i]
];

function splitClauses(text = '') {
  return String(text)
    .split(/[。；;\n]|(?=\d+[.、])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSection(raw = '', startRx, endRx) {
  const start = raw.search(startRx);
  if (start < 0) return '';
  const sliced = raw.slice(start);
  const heading = sliced.match(startRx)?.[0] || '';
  const body = sliced.slice(heading.length);
  const end = body.search(endRx);
  return (end >= 0 ? body.slice(0, end) : body).trim();
}

function extractResponsibilities(job = {}) {
  const raw = rawTextOf(job);
  return extractSection(raw,
    /岗位职责|工作职责|职位描述|职责描述|主要职责|工作内容/i,
    /任职资格|任职要求|职位要求|岗位要求|招聘要求|申请资格/i
  ) || raw;
}

function extractRequirements(job = {}) {
  const raw = rawTextOf(job);
  return extractSection(raw,
    /任职资格|任职要求|职位要求|岗位要求|招聘要求|申请资格/i,
    /岗位职责|工作职责|职位描述|职责描述|主要职责|工作内容/i
  ) || raw;
}

function majorClauses(job = {}) {
  return splitClauses(extractRequirements(job)).filter((clause) => MAJOR_CONTEXT_RX.test(clause) && (STEM_RX.test(clause) || LANGUAGE_MAJOR_RX.test(clause) || BROAD_SOCIAL_RX.test(clause) || MARKET_BUSINESS_RX.test(clause) || FLEXIBLE_RX.test(clause)));
}

export function analyzeMajorOrientation(job = {}) {
  const clauses = majorClauses(job);
  if (!clauses.length) return { verdict: '待核', label: '未识别明确专业范围', evidence: [] };

  let hasOpen = false;
  let hasLanguage = false;
  let hasBroadSocial = false;
  let hasMarketBusiness = false;
  let hasStem = false;
  let preferredOnly = true;
  const evidence = [];

  for (const clause of clauses) {
    hasOpen ||= FLEXIBLE_RX.test(clause);
    hasLanguage ||= LANGUAGE_MAJOR_RX.test(clause);
    hasBroadSocial ||= BROAD_SOCIAL_RX.test(clause);
    hasMarketBusiness ||= MARKET_BUSINESS_RX.test(clause);
    hasStem ||= STEM_RX.test(clause);
    preferredOnly &&= PREFERRED_RX.test(clause) || FLEXIBLE_RX.test(clause);
    evidence.push(clause.slice(0, 120));
  }

  if (hasOpen) return { verdict: '友好', label: '专业不限', evidence };
  if (hasStem && !hasLanguage && !hasBroadSocial && !hasMarketBusiness) {
    return { verdict: preferredOnly ? '降权' : '硬门槛', label: '理工/计算机专业主导', evidence };
  }
  if (hasMarketBusiness && !hasLanguage && !hasBroadSocial && !hasStem) {
    return { verdict: preferredOnly ? '降权' : '硬门槛', label: '商科/市场专业主导', evidence };
  }
  if (hasLanguage || (hasBroadSocial && (hasMarketBusiness || !hasStem))) {
    return { verdict: '兼容', label: '文科/社科专业范围兼容', evidence };
  }
  if (hasStem && (hasLanguage || hasBroadSocial || hasMarketBusiness)) {
    return { verdict: '混合', label: '专业范围较宽，含技术与文商科', evidence };
  }
  return { verdict: '待核', label: '专业范围需人工核对', evidence };
}

export function requiresMandatoryStem(job = {}) {
  const major = analyzeMajorOrientation(job);
  return major.verdict === '硬门槛' && major.label === '理工/计算机专业主导';
}

export function requiresMandatoryMajorMismatch(job = {}) {
  const major = analyzeMajorOrientation(job);
  return major.verdict === '硬门槛' && /理工|商科|市场/.test(major.label);
}

export function analyzeResponsibilityOrientation(job = {}) {
  const duties = extractResponsibilities(job);
  const technical = TECH_DUTY_RULES.filter(([, rx]) => rx.test(duties)).map(([label]) => label);
  const business = BUSINESS_DUTY_RULES.filter(([, rx]) => rx.test(duties)).map(([label]) => label);
  let verdict = '待核';
  if (technical.length >= 2 && technical.length > business.length) verdict = '技术主导';
  else if (business.length >= 2 && business.length >= technical.length) verdict = '语言/商务主导';
  else if (technical.length && business.length) verdict = '混合';
  else if (technical.length) verdict = '偏技术';
  else if (business.length) verdict = '偏语言/商务';
  return { verdict, technical, business };
}

export function isTechnicalDutyDominant(job = {}) {
  return analyzeResponsibilityOrientation(job).verdict === '技术主导';
}

export function requiresHardTechnicalAbility(job = {}) {
  for (const clause of splitClauses(extractRequirements(job))) {
    if (!TECH_TERM_RX.test(clause)) continue;
    if (PREFERRED_RX.test(clause)) continue;
    if (TECH_MANDATORY_RX.test(clause)) return true;
    const hits = clause.match(new RegExp(TECH_TERM_RX.source, 'gi')) || [];
    if (hits.length >= 3) return true;
  }
  return false;
}

export function requiresProfessionalCertificate(job = {}) {
  for (const clause of splitClauses(extractRequirements(job))) {
    if (!CERT_RX.test(clause)) continue;
    if (PREFERRED_RX.test(clause)) continue;
    if (CERT_MANDATORY_RX.test(clause)) return true;
  }
  return false;
}

function detectEligibilityEvidence(job = {}) {
  const text = textOf(job);
  const evidence = [];
  if (/2027届|2027\s*届/.test(text) || String(job?.graduationYear || '') === '2027') evidence.push('招聘对象：2027届');
  const window = text.match(/(2026)年?\s*[.\/-]?\s*(9|09)月?[^。；\n]{0,80}(2027)年?\s*[.\/-]?\s*(8|08)月?/);
  if (window) evidence.push('毕业时间窗口：2026-09 至 2027-08');
  if (job?.deadline) evidence.push(`投递截止：${job.deadline}`);
  return evidence;
}

export function analyzeCandidateFit(job = {}) {
  const requirements = extractRequirements(job);
  const warnings = [];
  const strengths = [];
  const major = analyzeMajorOrientation(job);
  const responsibility = analyzeResponsibilityOrientation(job);

  if (major.verdict === '降权') warnings.push(major.label === '商科/市场专业主导' ? '商科/市场知识底子更占优' : '技术专业背景更占优');
  if (major.verdict === '混合') warnings.push('专业范围含技术方向，需核对具体优先级');
  if (major.verdict === '友好') strengths.push('专业不限');
  if (major.verdict === '兼容') strengths.push('文科/社科专业范围兼容');

  for (const clause of splitClauses(requirements)) {
    if (PREFERRED_RX.test(clause) && TECH_TERM_RX.test(clause)) warnings.push('技术背景优先');
    if (RELATED_MASTER_RX.test(clause)) warnings.push('相关专业硕士优先');
    if (PREFERRED_RX.test(clause) && CERT_RX.test(clause)) warnings.push('专业证书优先');
  }

  if (/语言\/商务主导|偏语言\/商务/.test(responsibility.verdict)) {
    strengths.push(...responsibility.business.map((item) => `职责：${item}`));
  } else if (responsibility.verdict === '混合') {
    strengths.push(...responsibility.business.slice(0, 2).map((item) => `职责：${item}`));
    warnings.push('职责同时含技术与商务内容');
  } else if (/技术主导|偏技术/.test(responsibility.verdict)) {
    warnings.push('工作职责偏技术');
  }

  const uniqueWarnings = [...new Set(warnings)];
  const uniqueStrengths = [...new Set(strengths)];
  const penaltyMap = {
    '商科/市场知识底子更占优': 12,
    '技术专业背景更占优': 12,
    '技术背景优先': 8,
    '相关专业硕士优先': 8,
    '专业证书优先': 6,
    '专业范围含技术方向，需核对具体优先级': 5,
    '职责同时含技术与商务内容': 6,
    '工作职责偏技术': 10
  };
  const penalty = Math.min(28, uniqueWarnings.reduce((sum, item) => sum + (penaltyMap[item] || 0), 0));
  const responsibilityBonus = responsibility.business.length >= 2 ? Math.min(6, responsibility.business.length * 2) : 0;
  const openBonus = major.verdict === '友好' ? 2 : 0;
  const bonus = Math.min(8, responsibilityBonus + openBonus);

  const hardRequirements = [];
  if (requiresMandatoryMajorMismatch(job)) hardRequirements.push(major.label);
  if (requiresHardTechnicalAbility(job)) hardRequirements.push('具体技术知识/能力为硬要求');
  if (requiresProfessionalCertificate(job)) hardRequirements.push('专业资格证书为硬要求');
  if (isTechnicalDutyDominant(job)) hardRequirements.push('工作职责由技术任务主导');

  return {
    warnings: uniqueWarnings,
    strengths: uniqueStrengths,
    penalty,
    bonus,
    major,
    responsibility,
    hardRequirements: [...new Set(hardRequirements)],
    eligibilityEvidence: detectEligibilityEvidence(job),
    decisionSteps: [
      { step: 1, label: '专业范围', verdict: major.verdict, detail: major.label },
      { step: 2, label: '职责动词', verdict: responsibility.verdict, detail: [...responsibility.business, ...responsibility.technical].slice(0, 4).join('、') || '未识别明显信号' },
      { step: 3, label: '硬技术/资格', verdict: hardRequirements.length ? '存在硬门槛' : '未发现硬门槛', detail: hardRequirements.join('、') || '无' }
    ]
  };
}

export function jobPolicyReasons(job = {}) {
  const reasons = [];
  if (isInternshipJob(job)) reasons.push('实习岗位');
  if (isEngineeringOrImplementationJob(job)) reasons.push('明确技术工程/实施岗位');
  if (requiresMandatoryMajorMismatch(job)) reasons.push('专业硬门槛与英语专业不匹配');
  if (isTechnicalDutyDominant(job)) reasons.push('技术职责主导');
  if (requiresHardTechnicalAbility(job)) reasons.push('硬技术能力要求');
  if (requiresProfessionalCertificate(job)) reasons.push('必须专业资格证书');
  if (job?.riskTags?.includes('纯销售')) reasons.push('纯销售');
  return [...new Set(reasons)];
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
    preferenceTags: [...new Set([...(job.preferenceTags || []), ...fit.strengths.filter((item) => !item.startsWith('职责：'))])]
  };
}
