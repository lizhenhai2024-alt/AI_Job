const WEIGHTS = {
  role: 28,
  skills: 22,
  city: 12,
  experience: 12,
  language: 10,
  graduation: 8,
  preference: 8
};

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

function dimension(label, weight, ratio, detail) {
  return {
    label,
    weight,
    ratio: Number(ratio.toFixed(2)),
    score: Math.round(weight * ratio),
    detail
  };
}

export function evaluateJob(job, profile) {
  const roleRatio = anyAlternativeMatch(profile.targetRoles, [...(job.roleFamily ?? []), job.title]);
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
    dimension('经历', WEIGHTS.experience, experienceRatio, experienceRatio >= 0.67 ? '经历关键词匹配' : '相关经历证据偏少'),
    dimension('语言', WEIGHTS.language, languageRatio, languageRatio >= 0.67 ? '语言要求匹配' : '语言证据不足'),
    dimension('届别', WEIGHTS.graduation, graduationRatio, graduationRatio === 1 ? '毕业届别匹配' : '届别需核验'),
    dimension('偏好', WEIGHTS.preference, preferenceRatio, preferenceRatio >= 0.67 ? '职业偏好匹配' : '偏好匹配一般')
  ];

  const matchedExclusions = (profile.exclusions ?? []).filter((rule) =>
    (job.riskTags ?? []).some((risk) => tokenHit(rule, risk)) || tokenHit(rule, job.title)
  );
  const baseScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  const penalty = Math.min(30, matchedExclusions.length * 15);
  const score = Math.max(0, Math.min(100, baseScore - penalty));

  const highlights = dimensions
    .filter((item) => item.ratio >= 0.67)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => item.detail);

  const gaps = dimensions
    .filter((item) => item.ratio < 0.5)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => item.detail);

  const level = score >= 80 ? '强烈推荐' : score >= 65 ? '值得投递' : score >= 50 ? '可以尝试' : '谨慎考虑';

  return {
    score,
    level,
    dimensions,
    highlights,
    gaps,
    risks: [...matchedExclusions.map((item) => `命中排除条件：${item}`), ...(job.riskTags ?? [])]
  };
}

export function rankJobs(jobs, profile) {
  return jobs
    .map((job) => ({ ...job, match: evaluateJob(job, profile) }))
    .sort((a, b) => b.match.score - a.match.score || String(b.publishedAt).localeCompare(String(a.publishedAt)));
}
