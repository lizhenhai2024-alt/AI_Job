import { companyRegistry, canonicalCompanyKey } from '../data/company-registry.js';

// V3: eligibility is a gate, not a score. The 100-point score answers one
// question only: for an eligible role, how worthwhile is it for this candidate?
const V3_WEIGHTS = {
  responsibility: 25,
  majorLanguage: 20,
  evidence: 25,
  career: 20,
  quality: 10
};

const ROLE_INTENT_GROUPS = [
  /海外运营|国际运营|全球运营|本地化运营|海外推广运营|海外业务|国际业务|国际商务|海外商务/i,
  /贸易运营|国际贸易|贸易执行|外贸运营/i,
  /\bGTM\b|go[- ]?to[- ]?market|产品GTM/i,
  /产品营销|品牌经理|品牌管理|品牌运营|品牌市场|市场营销|市场推广|市场管培/i,
  /用户运营|会员运营|用户增长|社区运营/i,
  /电商运营|电商实习|跨境电商|平台运营|店铺运营/i,
  /内容运营|社媒运营|KOL运营|SEO运营|新媒体|内容策划/i,
  /产品运营|产品增长|产品策划/i,
  /业务运营|运营管理|经营管理|销售运营|商务运营|战略运营|部门运营|服务运营/i,
  /项目管理|项目运营|项目推进|项目协调|PMO/i,
  /人力资源|招聘运营|校园招聘|HRBP|\bHR\b/i
];

const HARD_GATE_RX = /实习|\bintern(?:ship)?\b|实施|必须理工科|纯销售/i;
const INTERNATIONAL_RX = /海外|国际|全球|跨境|出海|GTM|本地化|英语|英文/i;
const CAREER_SIGNAL_RX = /GTM|产品|品牌|市场|运营|项目|PMO|商务|贸易|供应链|物流|客户成功|经营分析|商业分析|人力资源|招聘/i;
const RISK_WEIGHTS = [
  [/长期驻外|海外外派|长期海外/i, 10, '长期驻外'],
  [/海外出差|频繁出差/i, 4, '高频出差'],
  [/节奏快|高强度|抗压/i, 3, '工作强度'],
  [/技术背景优先|技术专业背景更占优/i, 5, '技术背景竞争劣势'],
  [/商科\/市场|商科.*占优|市场.*占优/i, 4, '商科/市场背景竞争劣势'],
  [/专业范围含技术方向/i, 3, '专业范围含技术方向']
];

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function tokenHit(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function requirementCoverage(profileItems = [], jobItems = [], emptyJobRatio = 0.5) {
  if (!profileItems.length) return 0.5;
  if (!jobItems.length) return emptyJobRatio;
  const hits = jobItems.filter((item) => profileItems.some((profileItem) => tokenHit(profileItem, item))).length;
  return Math.min(1, hits / jobItems.length);
}

function anyAlternativeMatch(profileItems = [], jobItems = [], emptyJobRatio = 0.55) {
  if (!profileItems.length) return 0.5;
  if (!jobItems.length) return emptyJobRatio;
  return profileItems.some((profileItem) => jobItems.some((item) => tokenHit(profileItem, item))) ? 1 : 0;
}

function roleIntentMatch(profileItems = [], jobItems = []) {
  const direct = anyAlternativeMatch(profileItems, jobItems, 0);
  if (direct === 1 || !profileItems.length) return direct;
  const profileText = profileItems.join(' ');
  const jobText = jobItems.join(' ');
  return ROLE_INTENT_GROUPS.some((group) => group.test(profileText) && group.test(jobText)) ? 1 : 0;
}

function dimension(key, label, weight, ratio, detail, evidence = []) {
  const bounded = clamp01(ratio);
  return {
    key,
    label,
    weight,
    ratio: Number(bounded.toFixed(2)),
    score: Math.round(weight * bounded),
    detail,
    evidence: evidence.filter(Boolean).slice(0, 4)
  };
}

function experienceEvidenceFor(job, profile) {
  const catalog = Array.isArray(profile?.experienceEvidence) ? profile.experienceEvidence : [];
  if (!catalog.length) {
    return {
      configured: false,
      matches: [],
      directMatches: [],
      verdict: '待补充真实经历证据',
      detail: '当前画像没有可追溯的经历证据；系统不会自动声称“做过类似工作”。'
    };
  }

  const jobSignals = [
    job.title,
    ...(job.roleFamily || []),
    ...(job.experienceKeywords || []),
    ...(job.skills || []),
    ...(job.preferenceTags || []),
    ...(job.candidateFit?.responsibility?.business || []),
    ...(job.candidateFit?.responsibility?.technical || [])
  ].filter(Boolean);

  const matches = catalog.map((item) => {
    const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
    const matchedKeywords = keywords.filter((kw) => jobSignals.some((signal) => tokenHit(kw, signal)));
    return {
      name: item.name || '未命名经历',
      evidence: item.evidence || '',
      keywords,
      matchedKeywords,
      hitCount: matchedKeywords.length
    };
  }).filter((item) => item.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount || a.name.localeCompare(b.name, 'zh-CN'));

  const directMatches = matches.filter((item) => item.hitCount >= 2);
  const verdict = directMatches.length ? '有直接经历证据' : matches.length ? '有弱相关经历证据' : '没有直接经历证据';
  const detail = directMatches.length
    ? `直接对应：${directMatches.slice(0, 3).map((item) => `${item.name}（${item.matchedKeywords.slice(0, 3).join('、')}）`).join('；')}`
    : matches.length
      ? `仅弱相关：${matches.slice(0, 2).map((item) => item.name).join('、')}，不建议把弱相关改写成直接经验。`
      : '没有找到能直接对应岗位职责的已记录经历；不建议靠改写文案制造经验。';

  return { configured: true, matches, directMatches, verdict, detail };
}

function eligibilityFor(job, profile, matchedExclusions = []) {
  const expected = normalize(profile?.graduationYear);
  const actual = normalize(job?.graduationYear);
  const cohortMatch = !expected || !actual ? null : expected === actual;
  const hardRuleHits = matchedExclusions.filter((rule) => HARD_GATE_RX.test(String(rule)));
  const hardRequirements = job?.candidateFit?.hardRequirements || [];
  const majorHardGate = job?.candidateFit?.major?.verdict === '硬门槛';
  const passed = cohortMatch !== false && hardRuleHits.length === 0 && hardRequirements.length === 0 && !majorHardGate;
  const reasons = [];
  if (cohortMatch === false) reasons.push('届别/毕业时间不符');
  if (hardRuleHits.length) reasons.push(...hardRuleHits.map((item) => `命中硬过滤：${item}`));
  if (hardRequirements.length) reasons.push(...hardRequirements.map((item) => `硬能力门槛：${item}`));
  if (majorHardGate) reasons.push(`专业硬门槛：${job.candidateFit?.major?.label || '专业不匹配'}`);
  return {
    passed,
    cohortMatch,
    verdict: passed ? (cohortMatch === null ? '资格待核' : '资格通过') : '资格不通过',
    reasons,
    evidence: job?.candidateFit?.eligibilityEvidence || (job?.graduationYear ? [`招聘对象：${job.graduationYear}届`] : [])
  };
}

function responsibilityRatio(job, profile) {
  const roleRatio = roleIntentMatch(profile.targetRoles || [], [...(job.roleFamily || []), job.title]);
  const verdict = job?.candidateFit?.responsibility?.verdict || '待核';
  const natureRatio = ({
    '语言/商务主导': 1,
    '偏语言/商务': 0.85,
    '混合': 0.55,
    '待核': 0.6,
    '偏技术': 0.25,
    '技术主导': 0
  })[verdict] ?? 0.6;
  const ratio = roleRatio * 0.75 + natureRatio * 0.25;
  return {
    ratio,
    detail: roleRatio >= 1 && natureRatio >= 0.85 ? '目标岗位方向命中，职责以语言/商务执行为主' : roleRatio >= 1 ? '目标岗位方向命中，但职责性质仍需核对' : '岗位方向与当前主求职方向存在偏差',
    evidence: [job.title, ...(job.candidateFit?.responsibility?.business || [])]
  };
}

function majorLanguageRatio(job, profile) {
  const major = job?.candidateFit?.major || { verdict: '待核', label: '专业范围待核' };
  const majorRatio = ({ '友好': 1, '兼容': 0.95, '待核': 0.65, '混合': 0.62, '降权': 0.5, '硬门槛': 0 })[major.verdict] ?? 0.65;
  const languageRatio = anyAlternativeMatch(profile.languages || [], job.languages || [], 0.58);
  const ratio = majorRatio * 0.6 + languageRatio * 0.4;
  const languageDetail = (job.languages || []).length ? (languageRatio === 1 ? '英语要求与画像匹配' : '语言要求不匹配') : 'JD未明确语言门槛';
  return {
    ratio,
    detail: `${major.label || '专业范围待核'}；${languageDetail}`,
    evidence: [...(major.evidence || []).slice(0, 2), ...(job.languages || [])]
  };
}

function evidenceRatio(job, profile, evidence) {
  if (!evidence.configured) return { ratio: 0.25, detail: evidence.detail, evidence: [] };
  const direct = evidence.directMatches.length;
  const weak = evidence.matches.length - direct;
  const directStrength = direct >= 3 ? 1 : direct === 2 ? 0.9 : direct === 1 ? 0.72 : weak ? 0.4 : 0.15;
  const keywordCoverage = requirementCoverage(profile.experienceKeywords || [], job.experienceKeywords || [], 0.45);
  const ratio = directStrength * 0.8 + keywordCoverage * 0.2;
  return {
    ratio,
    detail: evidence.detail,
    evidence: evidence.matches.slice(0, 3).map((item) => `${item.name}：${item.matchedKeywords.slice(0, 4).join('、')}`)
  };
}

function careerRatio(job, profile) {
  const preferenceRatio = requirementCoverage(profile.workPreference || [], job.preferenceTags || [], 0.45);
  const jobText = [job.title, ...(job.roleFamily || []), ...(job.preferenceTags || []), ...(job.candidateFit?.responsibility?.business || [])].join(' ');
  const internationalRatio = INTERNATIONAL_RX.test(jobText) ? 1 : 0.45;
  const roleValueRatio = CAREER_SIGNAL_RX.test(jobText) ? 1 : 0.55;
  const cityRatio = !(profile.targetCities || []).length ? 0.6 : (profile.targetCities || []).some((city) => tokenHit(city, job.city)) ? 1 : /全国|国外|海外/.test(String(job.city || '')) ? 0.65 : 0.35;
  const ratio = preferenceRatio * 0.3 + internationalRatio * 0.3 + roleValueRatio * 0.25 + cityRatio * 0.15;
  return {
    ratio,
    detail: `${internationalRatio === 1 ? '能发挥国际化/英语优势' : '英语优势不是岗位核心'}；${cityRatio === 1 ? '地点符合偏好' : '地点不是首选或需接受流动'}`,
    evidence: [...(job.preferenceTags || []), job.city]
  };
}

function companyRecordFor(job) {
  const key = canonicalCompanyKey(job.company);
  if (!key) return null;
  return companyRegistry.find((record) => {
    const candidate = canonicalCompanyKey(record.name);
    if (!candidate) return false;
    return candidate === key || (Math.min(candidate.length, key.length) >= 3 && (candidate.includes(key) || key.includes(candidate)));
  }) || null;
}

function qualityRatio(job) {
  const official = job?.sourceType === 'official' || /官方/.test(String(job?.verification || ''));
  const provenanceRatio = official ? 1 : job?.sourceType === 'secondary' ? 0.5 : 0.35;
  const record = companyRecordFor(job);
  const companyRatio = record?.status === '主投' ? 1 : record?.status === '观察' ? 0.75 : record?.status === '风险' ? 0.35 : record?.status === '移出' ? 0.15 : 0.6;
  const jdSignals = [job.sourceUrl, job.verification, job.candidateFit?.major, job.candidateFit?.responsibility].filter(Boolean).length;
  const completenessRatio = jdSignals >= 4 ? 1 : jdSignals === 3 ? 0.8 : 0.55;
  const ratio = provenanceRatio * 0.5 + companyRatio * 0.25 + completenessRatio * 0.25;
  return {
    ratio,
    detail: `${official ? '官方来源已核验' : '二手来源，投递前需回官网复核'}；公司库状态：${record?.status || '待归档'}`,
    evidence: [job.verification, record?.sourceManaged ? `官方源已接入：${(record.sourceProviders || []).join('/')}` : '']
  };
}

function riskAdjustment(job, profile, matchedExclusions, fitWarnings) {
  const texts = [job.title, ...(job.riskTags || []), ...fitWarnings, ...matchedExclusions].join(' ');
  const items = [];
  let penalty = 0;
  for (const [rx, points, label] of RISK_WEIGHTS) {
    if (!rx.test(texts) || items.some((item) => item.label === label)) continue;
    items.push({ label, points });
    penalty += points;
  }
  for (const rule of matchedExclusions) {
    if (HARD_GATE_RX.test(String(rule)) || items.some((item) => tokenHit(item.label, rule))) continue;
    items.push({ label: `个人偏好冲突：${rule}`, points: 6 });
    penalty += 6;
  }
  const fitPenalty = Math.min(10, Math.max(0, Number(job.candidateFit?.penalty || 0)));
  if (fitPenalty && !items.some((item) => /背景竞争劣势|专业范围/.test(item.label))) {
    items.push({ label: 'JD适配降权', points: fitPenalty });
    penalty += fitPenalty;
  }
  return { penalty: Math.min(25, penalty), items };
}

function tierFor(job, score, gate, evidence, risk) {
  const official = job?.sourceType === 'official' || /官方/.test(String(job?.verification || ''));
  if (!gate.passed) {
    return { tier: 'B', tierLabel: 'B档 · 不建议投递', tierReason: gate.reasons.join('；') || '资格 Gate 未通过', priority: '不建议投' };
  }
  if (score >= 80 && official && evidence.directMatches.length > 0 && risk.penalty <= 10) {
    return { tier: 'S', tierLabel: 'S档 · 优先投递', tierReason: '高匹配、官方来源、存在直接真实经历证据，且风险可控', priority: '优先投' };
  }
  if (score >= 68) {
    return {
      tier: 'A',
      tierLabel: official ? 'A档 · 建议投递' : 'A档 · 官网核验后投递',
      tierReason: official ? '总体匹配较高，但仍有一项以上短板或风险' : '匹配较高，但当前为二手来源，必须回官网二次确认',
      priority: '可以投'
    };
  }
  if (score >= 55) {
    return { tier: 'B', tierLabel: 'B档 · 机会型投递', tierReason: '存在明确匹配点，但短板或风险较明显', priority: '机会型' };
  }
  return { tier: 'B', tierLabel: 'B档 · 不建议投递', tierReason: '综合价值不足，默认不进入优先投递清单', priority: '不建议投' };
}

export function evaluateJob(job, profile) {
  const matchedExclusions = (profile.exclusions || []).filter((rule) =>
    (job.riskTags || []).some((risk) => tokenHit(rule, risk)) || tokenHit(rule, job.title)
  );
  const fitWarnings = job.candidateFit?.warnings || [];
  const fitStrengths = job.candidateFit?.strengths || [];
  const experienceEvidence = experienceEvidenceFor(job, profile);
  const gate = eligibilityFor(job, profile, matchedExclusions);

  const responsibility = responsibilityRatio(job, profile);
  const majorLanguage = majorLanguageRatio(job, profile);
  const evidence = evidenceRatio(job, profile, experienceEvidence);
  const career = careerRatio(job, profile);
  const quality = qualityRatio(job);

  const dimensions = [
    dimension('responsibility', '职责适配', V3_WEIGHTS.responsibility, responsibility.ratio, responsibility.detail, responsibility.evidence),
    dimension('majorLanguage', '专业 / 英语', V3_WEIGHTS.majorLanguage, majorLanguage.ratio, majorLanguage.detail, majorLanguage.evidence),
    dimension('evidence', '真实经历证据', V3_WEIGHTS.evidence, evidence.ratio, evidence.detail, evidence.evidence),
    dimension('career', '职业方向价值', V3_WEIGHTS.career, career.ratio, career.detail, career.evidence),
    dimension('quality', '公司 / 岗位质量', V3_WEIGHTS.quality, quality.ratio, quality.detail, quality.evidence)
  ];

  const risk = riskAdjustment(job, profile, matchedExclusions, fitWarnings);
  const baseScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  const gatedBase = gate.passed ? baseScore : Math.min(baseScore, 49);
  const score = Math.max(0, Math.min(100, gatedBase - risk.penalty));
  const tierInfo = tierFor(job, score, gate, experienceEvidence, risk);

  const dimensionHighlights = dimensions
    .filter((item) => item.ratio >= 0.75)
    .sort((a, b) => b.score - a.score)
    .map((item) => `${item.label}：${item.detail}`);
  const highlights = [
    ...fitStrengths.slice(0, 2).map((item) => `英语专业友好：${item}`),
    ...experienceEvidence.directMatches.slice(0, 2).map((item) => `真实经历：${item.name}`),
    ...dimensionHighlights
  ].slice(0, 4);

  const gaps = [
    ...gate.reasons,
    ...fitWarnings.map((item) => `竞争劣势：${item}`),
    ...(experienceEvidence.configured && !experienceEvidence.directMatches.length ? ['缺少强直接经历证据'] : []),
    ...dimensions.filter((item) => item.ratio < 0.55).map((item) => `${item.label}：${item.detail}`)
  ].slice(0, 4);

  const fourStepAnalysis = [
    ...(job.candidateFit?.decisionSteps || []),
    { step: 4, label: '真实经历', verdict: experienceEvidence.verdict, detail: experienceEvidence.detail },
    { step: 5, label: '投递价值', verdict: tierInfo.priority, detail: `${tierInfo.tierReason}；风险扣分 ${risk.penalty}` }
  ];

  return {
    score,
    level: tierInfo.priority,
    ...tierInfo,
    version: 'V3',
    gate,
    dimensions,
    breakdown: Object.fromEntries(dimensions.map((item) => [item.key, { score: item.score, max: item.weight, detail: item.detail }])),
    eligibility: gate,
    fourStepAnalysis,
    experienceEvidence,
    riskAdjustment: risk,
    fitAdjustment: risk.penalty === 0 ? 0 : -risk.penalty,
    highlights,
    gaps,
    risks: [...risk.items.map((item) => `${item.label} (-${item.points})`), ...(job.riskTags || [])],
    visibleByDefault: score >= 55 && gate.passed
  };
}

export function rankJobs(jobs, profile) {
  const tierRank = { S: 3, A: 2, B: 1 };
  const priorityRank = { '优先投': 4, '可以投': 3, '机会型': 2, '不建议投': 1 };
  return jobs
    .map((job) => ({ ...job, match: evaluateJob(job, profile) }))
    .sort((a, b) =>
      (priorityRank[b.match.priority] - priorityRank[a.match.priority]) ||
      (tierRank[b.match.tier] - tierRank[a.match.tier]) ||
      b.match.score - a.match.score ||
      String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
    );
}
