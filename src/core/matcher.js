const WEIGHTS = {
  role: 28,
  skills: 22,
  city: 12,
  experience: 12,
  language: 10,
  graduation: 8,
  preference: 8
};

const ROLE_INTENT_GROUPS = [
  /海外运营|国际运营|全球运营|本地化运营|海外推广运营/i,
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

const normalize = (value) => String(value ?? '').trim().toLowerCase();

function tokenHit(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function requirementCoverage(profileItems = [], jobItems = []) {
  if (!profileItems.length) return 0.5;
  if (!jobItems.length) return 0.5;
  const hits = jobItems.filter((item) => profileItems.some((profileItem) => tokenHit(profileItem, item))).length;
  return Math.min(1, hits / jobItems.length);
}

function anyAlternativeMatch(profileItems = [], jobItems = []) {
  if (!profileItems.length) return 0.5;
  if (!jobItems.length) return 0;
  return profileItems.some((profileItem) => jobItems.some((item) => tokenHit(profileItem, item))) ? 1 : 0;
}

function roleIntentMatch(profileItems = [], jobItems = []) {
  const direct = anyAlternativeMatch(profileItems, jobItems);
  if (direct === 1 || !profileItems.length) return direct;
  const profileText = profileItems.join(' ');
  const jobText = jobItems.join(' ');
  return ROLE_INTENT_GROUPS.some((group) => group.test(profileText) && group.test(jobText)) ? 1 : 0;
}

function dimension(label, weight, ratio, detail) {
  return {
    label,
    weight,
    ratio: Number(ratio.toFixed(2)),
    score: Math.round(weight * ratio),
    detail
  };
}

function experienceEvidenceFor(job, profile) {
  const catalog = Array.isArray(profile?.experienceEvidence) ? profile.experienceEvidence : [];
  if (!catalog.length) {
    return {
      configured: false,
      matches: [],
      verdict: '待补充真实经历证据',
      detail: '当前画像只有经历关键词，没有可追溯到具体实习/校园经历的证据；系统不会自动声称“做过类似工作”。'
    };
  }

  const jobSignals = [
    ...(job.experienceKeywords || []),
    ...(job.skills || []),
    ...(job.candidateFit?.responsibility?.business || []),
    ...(job.candidateFit?.responsibility?.technical || [])
  ];
  const matches = catalog.filter((item) => {
    const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
    return keywords.some((kw) => jobSignals.some((signal) => tokenHit(kw, signal)));
  }).map((item) => ({
    name: item.name || '未命名经历',
    evidence: item.evidence || '',
    keywords: item.keywords || []
  }));

  return {
    configured: true,
    matches,
    verdict: matches.length ? '有直接经历证据' : '没有直接经历证据',
    detail: matches.length
      ? `可对应：${matches.map((item) => item.name).join('、')}`
      : '没有找到能直接对应岗位职责的已记录实习/校园经历；不建议靠改写文案制造经验。'
  };
}

function eligibilityFor(job, profile) {
  const expected = normalize(profile?.graduationYear);
  const actual = normalize(job?.graduationYear);
  const cohortMatch = !expected || !actual ? null : expected === actual;
  return {
    cohortMatch,
    verdict: cohortMatch === true ? '届别匹配' : cohortMatch === false ? '届别不符' : '届别待核',
    evidence: job?.candidateFit?.eligibilityEvidence || (job?.graduationYear ? [`招聘对象：${job.graduationYear}届`] : [])
  };
}

function tierFor(job, score, matchedExclusions = [], fitWarnings = [], experienceEvidence, eligibility) {
  const official = job?.sourceType === 'official' || /官方/.test(String(job?.verification || ''));
  if (eligibility?.cohortMatch === false) {
    return { tier: 'B', tierLabel: 'B档 · 不建议投递', tierReason: '届别/毕业时间资格不匹配，内容匹配度不再作为主要依据' };
  }
  if (score >= 85 && matchedExclusions.length === 0 && fitWarnings.length === 0 && official && experienceEvidence?.matches?.length) {
    return { tier: 'S', tierLabel: 'S档 · 优先投递', tierReason: '高匹配、无硬性排除、官方来源已核验，且存在可追溯的真实经历证据' };
  }
  if (score >= 70 && matchedExclusions.length === 0) {
    if (!experienceEvidence?.configured) {
      return { tier: 'A', tierLabel: 'A档 · 建议投递', tierReason: '总体匹配，但真实经历证据尚未结构化，暂不升为 S 档' };
    }
    if (!experienceEvidence.matches.length) {
      return { tier: 'A', tierLabel: 'A档 · 谨慎投递', tierReason: '岗位总体匹配，但没有找到能直接对应职责的真实经历证据' };
    }
    return { tier: 'A', tierLabel: 'A档 · 建议投递', tierReason: fitWarnings.length ? '总体匹配，但存在专业/技术背景竞争劣势' : official ? '匹配较高且来源已核验' : '匹配较高，建议回官网核验后投递' };
  }
  return { tier: 'B', tierLabel: 'B档 · 备选观察', tierReason: matchedExclusions.length ? '命中硬性排除或风险项' : fitWarnings.length ? '存在专业背景、技术能力或职责性质竞争劣势' : '存在能力、城市或方向缺口' };
}

export function evaluateJob(job, profile) {
  const roleRatio = roleIntentMatch(profile.targetRoles, [...(job.roleFamily ?? []), job.title]);
  const skillRatio = requirementCoverage(profile.skills, job.skills ?? []);
  const cityRatio = (profile.targetCities ?? []).length === 0
    ? 0.5
    : (profile.targetCities ?? []).some((city) => tokenHit(city, job.city)) ? 1 : 0.2;
  const experienceRatio = requirementCoverage(profile.experienceKeywords, job.experienceKeywords ?? []);
  const languageRatio = anyAlternativeMatch(profile.languages, job.languages ?? []);
  const graduationRatio = !profile.graduationYear
    ? 0.5
    : normalize(profile.graduationYear) === normalize(job.graduationYear) ? 1 : 0;
  const preferenceRatio = requirementCoverage(profile.workPreference, job.preferenceTags ?? []);

  const dimensions = [
    dimension('岗位方向', WEIGHTS.role, roleRatio, roleRatio >= 0.67 ? '目标岗位族命中' : '岗位方向存在偏差'),
    dimension('技能', WEIGHTS.skills, skillRatio, skillRatio >= 0.67 ? '核心技能覆盖较好' : '需要补齐部分技能'),
    dimension('城市', WEIGHTS.city, cityRatio, cityRatio === 1 ? '符合目标城市' : '非首选城市'),
    dimension('经历', WEIGHTS.experience, experienceRatio, experienceRatio >= 0.67 ? '经历关键词相似' : '相关经历关键词偏少'),
    dimension('语言', WEIGHTS.language, languageRatio, languageRatio >= 0.67 ? '语言要求匹配' : '语言证据不足'),
    dimension('届别', WEIGHTS.graduation, graduationRatio, graduationRatio === 1 ? '毕业届别匹配' : '届别需核验'),
    dimension('偏好', WEIGHTS.preference, preferenceRatio, preferenceRatio >= 0.67 ? '职业偏好匹配' : '偏好匹配一般')
  ];

  const matchedExclusions = (profile.exclusions ?? []).filter((rule) =>
    (job.riskTags ?? []).some((risk) => tokenHit(rule, risk)) || tokenHit(rule, job.title)
  );
  const fitWarnings = job.candidateFit?.warnings ?? [];
  const fitStrengths = job.candidateFit?.strengths ?? [];
  const experienceEvidence = experienceEvidenceFor(job, profile);
  const eligibility = eligibilityFor(job, profile);
  const baseScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  const hardPenalty = Math.min(30, matchedExclusions.length * 15);
  const fitPenalty = Number(job.candidateFit?.penalty || 0);
  const fitBonus = Number(job.candidateFit?.bonus || 0);
  const score = Math.max(0, Math.min(100, baseScore - hardPenalty - fitPenalty + fitBonus));

  const dimensionHighlights = dimensions
    .filter((item) => item.ratio >= 0.67)
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.detail);
  const highlights = [
    ...fitStrengths.slice(0, 2).map((item) => `英语专业友好：${item}`),
    ...(experienceEvidence.matches || []).slice(0, 1).map((item) => `真实经历：${item.name}`),
    ...dimensionHighlights
  ].slice(0, 3);

  const dimensionGaps = dimensions
    .filter((item) => item.ratio < 0.5)
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.detail);
  const gaps = [
    ...fitWarnings.map((item) => `竞争劣势：${item}`),
    ...(experienceEvidence.configured && !experienceEvidence.matches.length ? ['没有直接经历证据'] : []),
    ...dimensionGaps
  ].slice(0, 3);

  const level = score >= 80 ? '强烈推荐' : score >= 65 ? '值得投递' : score >= 50 ? '可以尝试' : '谨慎考虑';
  const tierInfo = tierFor(job, score, matchedExclusions, fitWarnings, experienceEvidence, eligibility);
  const fourStepAnalysis = [
    ...(job.candidateFit?.decisionSteps || []),
    { step: 4, label: '真实经历', verdict: experienceEvidence.verdict, detail: experienceEvidence.detail }
  ];

  return {
    score,
    level,
    ...tierInfo,
    dimensions,
    eligibility,
    fourStepAnalysis,
    experienceEvidence,
    fitAdjustment: fitBonus - fitPenalty,
    highlights,
    gaps,
    risks: [...matchedExclusions.map((item) => `命中排除条件：${item}`), ...(job.riskTags ?? [])]
  };
}

export function rankJobs(jobs, profile) {
  const tierRank = { S: 3, A: 2, B: 1 };
  return jobs
    .map((job) => ({ ...job, match: evaluateJob(job, profile) }))
    .sort((a, b) => (tierRank[b.match.tier] - tierRank[a.match.tier]) || b.match.score - a.match.score || String(b.publishedAt).localeCompare(String(a.publishedAt)));
}
