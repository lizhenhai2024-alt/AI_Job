function sourceRank(job = {}) {
  return job.sourceType === 'official' ? 2 : job.sourceType === 'secondary' ? 1 : 0;
}

// 快照保留岗位（unhealthy 时从 existing/historical 捞回）永远不得压过本轮新抓岗位。
// refresh-jobs.mjs 在保留时给岗位打 _snapshotRetained: true 标记；cleanForStorage 会剔除 _ 前缀字段。
export function preferFresh(prev = {}, next = {}) {
  const nextRetained = Boolean(next._snapshotRetained);
  const prevRetained = Boolean(prev._snapshotRetained);
  if (nextRetained && !prevRetained) return false;
  if (prevRetained && !nextRetained) return true;
  const prevRank = sourceRank(prev);
  const nextRank = sourceRank(next);
  return nextRank > prevRank || (nextRank === prevRank && String(next.publishedAt || '') > String(prev.publishedAt || ''));
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

export function jobDedupeKey(job = {}) {
  return `${String(job.company || '').trim().toLowerCase()}|${String(job.title || '').replace(/[\s【】〖〗()（）\-_]/g,'').toLowerCase()}|${String(job.city || '').trim().toLowerCase()}`;
}

export function dedupePreferOfficial(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    // Moka 源岗位是"同标题族多投递方向"结构（如韶音品牌营销管培生=多语种多个唯一jobId），
    // 按 title 合并会压没不同投递机会，故 Moka 岗位以唯一 id 为 key 保留全部方向。
    const key = String(job.id || '').startsWith('moka-') ? `moka:${job.id}` : jobDedupeKey(job);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...job });
      continue;
    }
    const chooseNext = preferFresh(prev, job);
    const primary = chooseNext ? job : prev;
    const secondary = chooseNext ? prev : job;
    const mergedEvidence = mergeEvidence(primary, secondary);
    map.set(key, {
      ...primary,
      sourceEvidence: mergedEvidence,
      crossSourceCount: distinctSourceCount(mergedEvidence)
    });
  }
  return [...map.values()];
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
    const chooseNext = preferFresh(prev, job);
    const primary = chooseNext ? job : prev;
    const secondary = chooseNext ? prev : job;
    const mergedEvidence = mergeEvidence(primary, secondary);
    map.set(job.id, {
      ...primary,
      sourceEvidence: mergedEvidence,
      crossSourceCount: distinctSourceCount(mergedEvidence)
    });
  }
  return [...map.values()];
}
