const ACTIVE_STATUSES = new Set(['主投', '观察']);
const STATUS_WEIGHT = { '主投': 100, '观察': 50 };
const ATS_HOSTS = [
  ['moka', /(^|\.)app\.mokahr\.com$/i],
  ['beisen', /(^|\.)zhiye\.com$/i],
  ['feishu', /(^|\.)jobs\.feishu\.cn$/i],
  ['hotjob', /^wecruit\.hotjob\.cn$/i]
];
const BLOCKED_HOST_RX = /(^|\.)(nowcoder\.com|zhipin\.com|liepin\.com|51job\.com|lagou\.com|linkedin\.com|xiaohongshu\.com|weibo\.com|zhihu\.com|baidu\.com|google\.com|bing\.com|duckduckgo\.com)$/i;
const CAREER_TOKEN_RX = /(career|careers|job|jobs|campus|recruit|recruitment|join|graduate|school|talent|hire|hiring)/i;

export function canonicalCompanyKey(value = '') {
  return String(value || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '')
    .toLowerCase()
    .trim();
}

export function sourceProviderFromUrl(value = '') {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ATS_HOSTS.find(([, rx]) => rx.test(host))?.[0] || '';
  } catch {
    return '';
  }
}

export function isLikelyOfficialCareerUrl(value = '') {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || BLOCKED_HOST_RX.test(url.hostname)) return false;
    if (sourceProviderFromUrl(value)) return true;
    return CAREER_TOKEN_RX.test(`${url.hostname}${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}

function decodeBingTarget(value = '') {
  const decoded = decodeURIComponent(String(value || ''));
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (!/^a1/i.test(decoded)) return '';
  const encoded = decoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  try {
    const text = Buffer.from(padded, 'base64').toString('utf8');
    return /^https?:\/\//i.test(text) ? text : '';
  } catch {
    return '';
  }
}

export function decodeSearchHref(value = '') {
  try {
    const absolute = value.startsWith('//') ? `https:${value}` : value;
    const url = new URL(absolute, 'https://duckduckgo.com');
    const host = url.hostname.toLowerCase();
    const target = url.searchParams.get('uddg') || url.searchParams.get('url') || url.searchParams.get('u');
    if (target) {
      if (/(^|\.)bing\.com$/i.test(host)) return decodeBingTarget(target) || decodeURIComponent(target);
      return decodeURIComponent(target);
    }
    return url.href;
  } catch {
    return '';
  }
}

export function extractSearchCandidates(html = '') {
  const candidates = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeSearchHref(match[1]);
    if (!url || seen.has(url) || !isLikelyOfficialCareerUrl(url)) continue;
    const text = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
    seen.add(url);
    candidates.push({ url, text, provider: sourceProviderFromUrl(url) });
  }
  return candidates.slice(0, 30);
}

export function cohortEvidence(text = '') {
  return /2027\s*届|27\s*届|2027[^\n。]{0,40}(校园招聘|校招|秋招)|(校园招聘|校招|秋招)[^\n。]{0,40}2027/i.test(String(text));
}

export function buildDiscoveryQueue(records = [], audit = {}, { limit = 12, now = new Date(), forceRetry = false } = {}) {
  const current = now.getTime();
  const rows = [];
  for (const record of records || []) {
    if (!record?.name || !ACTIVE_STATUSES.has(record.status) || record.sourceManaged) continue;
    const key = canonicalCompanyKey(record.name);
    if (!key) continue;
    const previous = audit?.companies?.[key] || {};
    const dueAt = previous.nextCheckAfter ? new Date(previous.nextCheckAfter).getTime() : 0;
    if (!forceRetry && dueAt && Number.isFinite(dueAt) && dueAt > current) continue;
    const evidenceCount = Number(record.evidence?.count || 0);
    const priority = (STATUS_WEIGHT[record.status] || 0) + (record.userRequested ? 30 : 0) + Math.min(evidenceCount, 10) * 2 + (!previous.lastCheckedAt ? 20 : 0);
    rows.push({
      key,
      name: record.name,
      status: record.status,
      careerUrl: record.careerUrl || '',
      aliases: [...(record.aliases || [])],
      targetTracks: [...(record.targetTracks || [])],
      evidenceCount,
      userRequested: Boolean(record.userRequested),
      priority,
      attempts: Number(previous.attempts || 0)
    });
  }
  return rows.sort((a, b) => b.priority - a.priority || a.attempts - b.attempts || a.name.localeCompare(b.name, 'zh-CN')).slice(0, Math.max(1, Math.min(Number(limit) || 12, 40)));
}

export function nextCheckAfter(state, now = new Date()) {
  const delayDays = state === 'search_error' ? 1 : state === 'candidate_found' || state === 'needs_adapter' ? 3 : state === 'no_2027_evidence' ? 5 : 7;
  return new Date(now.getTime() + delayDays * 86400000).toISOString();
}

export function mergeAuditEntry(previous = {}, patch = {}, now = new Date()) {
  const state = patch.state || previous.state || 'queued';
  return {
    ...previous,
    ...patch,
    attempts: Number(previous.attempts || 0) + 1,
    lastCheckedAt: now.toISOString(),
    nextCheckAfter: patch.nextCheckAfter || (state === 'source_registered' ? '' : nextCheckAfter(state, now))
  };
}
