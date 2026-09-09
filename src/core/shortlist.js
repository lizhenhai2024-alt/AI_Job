const ACTIVE_PRE_APPLY_STATUSES = new Set(['推荐', '已收藏']);
const PRIORITY_RANK = { '优先投': 4, '可以投': 3, '机会型': 2, '不建议投': 1 };
const TIER_RANK = { S: 3, A: 2, B: 1 };

function isEligibleForDaily(job) {
  if (!job?.id || !job?.match) return false;
  if (job.match.gate?.passed === false) return false;
  if (job.match.visibleByDefault === false) return false;
  if (Number(job.match.score || 0) < 55) return false;
  if (!ACTIVE_PRE_APPLY_STATUSES.has(job.status || '推荐')) return false;
  return true;
}

function compareDaily(a, b) {
  return (PRIORITY_RANK[b.match?.priority] || 0) - (PRIORITY_RANK[a.match?.priority] || 0)
    || (TIER_RANK[b.match?.tier] || 0) - (TIER_RANK[a.match?.tier] || 0)
    || Number(b.match?.score || 0) - Number(a.match?.score || 0)
    || Number(b.match?.breakdown?.quality?.score || 0) - Number(a.match?.breakdown?.quality?.score || 0)
    || String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
    || String(a.id).localeCompare(String(b.id));
}

/**
 * Build the daily application shortlist from already V3-ranked jobs.
 *
 * Policy:
 * - never include failed gates, hidden <55 jobs, or already-applied outcomes;
 * - take all S/A candidates first, capped by max;
 * - if fewer than min S/A jobs exist, fill from eligible B/机会型 jobs;
 * - never pad with low-quality jobs merely to hit min.
 */
export function buildDailyShortlist(jobs = [], { min = 10, max = 20 } = {}) {
  const safeMin = Math.max(1, Math.min(Number(min) || 10, 20));
  const safeMax = Math.max(safeMin, Math.min(Number(max) || 20, 20));
  const eligible = jobs.filter(isEligibleForDaily).sort(compareDaily);
  const strong = eligible.filter((job) => job.match.tier === 'S' || job.match.tier === 'A');
  const opportunity = eligible.filter((job) => job.match.tier === 'B');

  const selected = strong.slice(0, safeMax);
  if (selected.length < safeMin) {
    selected.push(...opportunity.slice(0, Math.min(safeMin - selected.length, safeMax - selected.length)));
  }

  return selected.slice(0, safeMax);
}

export function dailyShortlistStats(jobs = []) {
  const shortlist = buildDailyShortlist(jobs);
  return {
    total: shortlist.length,
    s: shortlist.filter((job) => job.match.tier === 'S').length,
    a: shortlist.filter((job) => job.match.tier === 'A').length,
    b: shortlist.filter((job) => job.match.tier === 'B').length,
    official: shortlist.filter((job) => job.sourceType === 'official' || /官方/.test(String(job.verification || ''))).length,
    needsVerification: shortlist.filter((job) => job.sourceType === 'secondary' || /二手|待官网核验/.test(String(job.verification || ''))).length
  };
}
