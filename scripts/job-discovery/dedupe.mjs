function sourceRank(job = {}) {
  return job.sourceType === 'official' ? 2 : job.sourceType === 'secondary' ? 1 : 0;
}

function evidenceRows(job = {}) {
  const rows = [];
  const push = (row) => {
    if (!row) return;
    if (typeof row === 'string') rows.push({ label: row, url: '' });
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

export function jobDedupeKey(job = {}) {
  return `${String(job.company || '').trim().toLowerCase()}|${String(job.title || '').replace(/[\s【】〖〗()（）\-_]/g,'').toLowerCase()}|${String(job.city || '').trim().toLowerCase()}`;
}

export function dedupePreferOfficial(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    const key = jobDedupeKey(job);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...job });
      continue;
    }
    const prevRank = sourceRank(prev);
    const nextRank = sourceRank(job);
    const chooseNext = nextRank > prevRank || (nextRank === prevRank && String(job.publishedAt || '') > String(prev.publishedAt || ''));
    const primary = chooseNext ? job : prev;
    const secondary = chooseNext ? prev : job;
    const mergedEvidence = mergeEvidence(primary, secondary);
    map.set(key, {
      ...primary,
      sourceEvidence: mergedEvidence,
      crossSourceCount: mergedEvidence.length
    });
  }
  return [...map.values()];
}
