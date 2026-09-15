import { canonicalCompanyKey } from '../../src/core/company-normalization.js';

function sourceRank(job = {}) {
  return job.sourceType === 'official' ? 2 : job.sourceType === 'secondary' ? 1 : 0;
}

function evidenceRows(job = {}) {
  const rows = [];
  const push = (row) => {
    if (!row) return;
    if (typeof row === 'string') rows.push({ label: row, url: /^https?:\/\//i.test(row) ? row : '' });
    else if (typeof row === 'object') rows.push({
      label: row.label || row.source || row.name || '',
      url: row.url || row.sourceUrl || ''
    });
  };
  push({ label: job.source || '', url: job.sourceUrl || '' });
  for (const row of job.sourceEvidence || []) push(row);
  for (const row of job.sources || []) push(row);
  return rows.filter((row) => row.label || row.url);
}

function mergeEvidence(primary, secondary) {
  const seen = new Set();
  const rows = [];
  for (const row of [...evidenceRows(primary), ...evidenceRows(secondary)]) {
    const key = `${row.label}|${row.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.slice(0, 12);
}

function evidenceOrigin(row = {}) {
  if (row.url) {
    try { return `host:${new URL(row.url).hostname.toLowerCase()}`; } catch {}
  }
  const label = String(row.label || '').replace(/招聘列表|职位列表|详情页|官方发布|官方招聘/gi, '').replace(/\s+/g, '').trim().toLowerCase();
  return label ? `label:${label}` : '';
}

function distinctSourceCount(rows = []) {
  return new Set(rows.map(evidenceOrigin).filter(Boolean)).size;
}

function sourceNamespace(job = {}) {
  try {
    const host = new URL(String(job.sourceUrl || '')).hostname.toLowerCase();
    if (host) return host;
  } catch {}
  return String(job.source || job.sourceChannel || 'unknown').replace(/\s+/g, '').toLowerCase();
}

function explicitExternalId(job = {}) {
  for (const key of ['sourceJobId', '_sourceJobId', 'externalJobId', 'jobId', 'positionId', 'requisitionId', 'postId']) {
    const value = String(job?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function externalIdFromUrl(value = '') {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    for (const key of ['jobAdId', 'jobId', 'positionId', 'postId', 'requisitionId']) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
  } catch {}
  const match = raw.match(/(?:#\/)?(?:job|jobs|position|positions|detail|posDetail)\/([A-Za-z0-9_-]{4,})|(?:jobAdId|jobId|positionId|postId|requisitionId)=([^&#/]+)/i);
  return String(match?.[1] || match?.[2] || '').trim();
}

export function strongJobIdentity(job = {}) {
  if (job?.sourceType !== 'official') return '';
  const externalId = explicitExternalId(job) || externalIdFromUrl(job.sourceUrl);
  if (!externalId) return '';
  return `${sourceNamespace(job)}|${externalId.toLowerCase()}`;
}

export function weakJobDedupeKey(job = {}) {
  return `${canonicalCompanyKey(job.company)}|${String(job.title || '').replace(/[\s【】〖〗()（）\-_]/g, '').toLowerCase()}|${String(job.city || '').trim().toLowerCase()}`;
}

export function jobDedupeKey(job = {}) {
  const strong = strongJobIdentity(job);
  return strong ? `strong|${strong}` : `weak|${weakJobDedupeKey(job)}`;
}

function chooseAndMerge(previous, next) {
  const prevRank = sourceRank(previous);
  const nextRank = sourceRank(next);
  const chooseNext = nextRank > prevRank || (nextRank === prevRank && String(next.publishedAt || '') > String(previous.publishedAt || ''));
  const primary = chooseNext ? next : previous;
  const secondary = chooseNext ? previous : next;
  const mergedEvidence = mergeEvidence(primary, secondary);
  return {
    ...primary,
    sourceEvidence: mergedEvidence,
    crossSourceCount: distinctSourceCount(mergedEvidence)
  };
}

export function dedupePreferOfficial(jobs = []) {
  const records = [];
  const strongIndex = new Map();
  const weakIndex = new Map();

  const addWeakIndex = (weak, index) => {
    const rows = weakIndex.get(weak) || [];
    if (!rows.includes(index)) rows.push(index);
    weakIndex.set(weak, rows);
  };

  for (const job of jobs) {
    if (!job?.id) continue;
    const strong = strongJobIdentity(job);
    const weak = weakJobDedupeKey(job);
    let targetIndex = strong ? strongIndex.get(strong) : undefined;

    if (targetIndex === undefined) {
      const candidates = weakIndex.get(weak) || [];
      if (strong) {
        const weakOnly = candidates.filter((index) => !strongJobIdentity(records[index]));
        if (weakOnly.length === 1) targetIndex = weakOnly[0];
      } else if (candidates.length === 1) {
        targetIndex = candidates[0];
      }
    }

    if (targetIndex === undefined) {
      const index = records.length;
      records.push({ ...job });
      if (strong) strongIndex.set(strong, index);
      addWeakIndex(weak, index);
      continue;
    }

    records[targetIndex] = chooseAndMerge(records[targetIndex], job);
    const mergedStrong = strongJobIdentity(records[targetIndex]);
    if (strong) strongIndex.set(strong, targetIndex);
    if (mergedStrong) strongIndex.set(mergedStrong, targetIndex);
    addWeakIndex(weak, targetIndex);
  }

  return records;
}

export function dedupeById(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    const prev = map.get(job.id);
    if (!prev) {
      map.set(job.id, job);
      continue;
    }
    map.set(job.id, chooseAndMerge(prev, job));
  }
  return [...map.values()];
}
