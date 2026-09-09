const PROFILE_KEY = 'ai-job.profile.v3';
const LEGACY_PROFILE_KEYS = ['ai-job.profile.v2', 'ai-job.profile.v1'];
const STATUS_KEY = 'ai-job.status.v1';
const COMPANY_INTAKE_KEY = 'ai-job.company-intake.v1';

const ARRAY_FIELDS = [
  'targetRoles', 'targetCities', 'skills', 'languages',
  'experienceKeywords', 'exclusions', 'workPreference'
];

const LEGACY_AUTO_SKILLS = new Set([
  'Jira', 'Confluence', 'DTC', 'Shopify', 'Amazon', 'TikTok Shop'
]);

function cleanLegacySaved(saved = {}) {
  const cleaned = { ...saved };
  if (Array.isArray(cleaned.skills)) {
    cleaned.skills = cleaned.skills.filter((item) => !LEGACY_AUTO_SKILLS.has(String(item)));
  }
  delete cleaned.experienceEvidence;
  return cleaned;
}

function mergeProfile(fallback, saved = {}) {
  const merged = { ...fallback, ...saved };
  for (const key of ARRAY_FIELDS) {
    const defaults = Array.isArray(fallback?.[key]) ? fallback[key] : [];
    const existing = Array.isArray(saved?.[key]) ? saved[key] : [];
    merged[key] = [...new Set([...defaults, ...existing])];
  }
  merged.experienceEvidence = structuredClone(fallback?.experienceEvidence || []);
  return merged;
}

export function loadProfile(fallback) {
  try {
    const current = localStorage.getItem(PROFILE_KEY);
    if (current) return mergeProfile(fallback, JSON.parse(current));

    for (const key of LEGACY_PROFILE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const migrated = mergeProfile(fallback, cleanLegacySaved(JSON.parse(legacy)));
      localStorage.setItem(PROFILE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    const fresh = structuredClone(fallback);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return structuredClone(fallback);
  }
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveStatuses(statuses) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
}

export function loadCompanyIntakes() {
  try {
    const rows = JSON.parse(localStorage.getItem(COMPANY_INTAKE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveCompanyIntakes(rows = []) {
  localStorage.setItem(COMPANY_INTAKE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
}

export function upsertCompanyIntake(request) {
  const rows = loadCompanyIntakes();
  const index = rows.findIndex((item) => item?.key && request?.key && item.key === request.key);
  if (index >= 0) rows[index] = { ...rows[index], ...request };
  else rows.unshift(request);
  saveCompanyIntakes(rows.slice(0, 100));
  return rows.slice(0, 100);
}
