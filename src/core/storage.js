const PROFILE_KEY = 'ai-job.profile.v2';
const LEGACY_PROFILE_KEY = 'ai-job.profile.v1';
const STATUS_KEY = 'ai-job.status.v1';

const ARRAY_FIELDS = [
  'targetRoles', 'targetCities', 'skills', 'languages',
  'experienceKeywords', 'exclusions', 'workPreference'
];

function mergeProfile(fallback, saved = {}) {
  const merged = { ...fallback, ...saved };
  for (const key of ARRAY_FIELDS) {
    const defaults = Array.isArray(fallback?.[key]) ? fallback[key] : [];
    const existing = Array.isArray(saved?.[key]) ? saved[key] : [];
    merged[key] = [...new Set([...defaults, ...existing])];
  }
  return merged;
}

export function loadProfile(fallback) {
  try {
    const current = localStorage.getItem(PROFILE_KEY);
    if (current) return mergeProfile(fallback, JSON.parse(current));

    const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
    const migrated = legacy ? mergeProfile(fallback, JSON.parse(legacy)) : structuredClone(fallback);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(migrated));
    return migrated;
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
