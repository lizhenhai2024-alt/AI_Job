const PROFILE_KEY = 'ai-job.profile.v1';
const STATUS_KEY = 'ai-job.status.v1';

export function loadProfile(fallback) {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
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
