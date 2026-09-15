#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');

// The old gate was `disclosed < 1`: a salary parser that regressed to
// recognising a single job in the whole pool still passed, the run stayed green,
// and the board showed 未披露 everywhere. Guard the extraction rate instead.
//
// Floor: the pool currently discloses for ~10% of rows (147/1443), so 2% leaves
// roughly 5x headroom for legitimate variation while catching a collapse.
const MIN_DISCLOSED_RATIO = 0.02;
// Snapshot comparison: a sharp drop versus the previously committed pool means
// the parser or the source pages broke, even if the absolute count is still high.
const MIN_RETAINED_RATIO = 0.6;
const MIN_SNAPSHOT_BASELINE = 10;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function readPreviousStat(name) {
  // `git show` the previous snapshot's metadata. Degrades to null (check skipped)
  // when git or the previous revision is unavailable, e.g. first run or shallow clone.
  try {
    const raw = execFileSync('git', ['show', 'HEAD:src/data/live-jobs.js'], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString('utf8');
    // Scope to discoveryMeta: every job also carries a `compensation` object, and
    // its `disclosed` is a boolean, so an unscoped match silently finds a job first.
    const metaAt = raw.indexOf('export const discoveryMeta');
    const metaText = metaAt >= 0 ? raw.slice(metaAt) : raw;
    const block = metaText.match(new RegExp(`"${name}"\\s*:\\s*\\{[^}]*\\}`, 's'));
    if (!block) return null;
    const disclosed = block[0].match(/"disclosed"\s*:\s*(\d+)/);
    const known = block[0].match(/"known"\s*:\s*(\d+)/);
    return num(Number(disclosed?.[1] ?? known?.[1]));
  } catch {
    return null;
  }
}

export function evaluateJobIntelligence(meta = {}, { previous = {} } = {}) {
  const failures = [];
  const stats = meta?.stats?.compensation;
  const headcount = meta?.stats?.headcount;
  const publication = meta?.stats?.publication;
  const totalJobs = num(stats?.totalJobs);

  if (!stats || num(stats.disclosed) === null) {
    failures.push(`[compensation-check] FAIL: stats.compensation missing or invalid: ${JSON.stringify(stats)}`);
  } else if (stats.disclosed < 1) {
    failures.push(`[compensation-check] FAIL: no job in the pool has a disclosed salary: ${JSON.stringify(stats)}`);
  } else if (totalJobs >= 50 && stats.disclosed / totalJobs < MIN_DISCLOSED_RATIO) {
    failures.push(
      `[compensation-check] FAIL: disclosed salary rate collapsed to ${stats.disclosed}/${totalJobs} ` +
      `(<${(MIN_DISCLOSED_RATIO * 100).toFixed(0)}%); the salary parser probably stopped matching.`
    );
  } else if (num(previous.compensation) >= MIN_SNAPSHOT_BASELINE && stats.disclosed < previous.compensation * MIN_RETAINED_RATIO) {
    failures.push(
      `[compensation-check] FAIL: disclosed salary dropped from ${previous.compensation} to ${stats.disclosed} ` +
      `vs the previous snapshot (<${MIN_RETAINED_RATIO * 100}%).`
    );
  }

  if (!headcount || num(headcount.disclosed) === null || num(headcount.jobLevel) === null || num(headcount.programLevel) === null) {
    failures.push(`[headcount-check] FAIL: stats.headcount missing or invalid: ${JSON.stringify(headcount)}`);
  }
  if (!publication || num(publication.known) === null) {
    failures.push(`[publication-check] FAIL: stats.publication missing or invalid: ${JSON.stringify(publication)}`);
  } else if (num(previous.publication) >= MIN_SNAPSHOT_BASELINE && publication.known < previous.publication * MIN_RETAINED_RATIO) {
    failures.push(
      `[publication-check] FAIL: publication dates dropped from ${previous.publication} to ${publication.known} ` +
      `vs the previous snapshot (<${MIN_RETAINED_RATIO * 100}%).`
    );
  }

  return { failures, stats, headcount, publication };
}

export function jobIntelligenceSummary({ stats, headcount, publication }) {
  return [
    `[compensation-check] OK disclosed=${stats.disclosed}/${stats.totalJobs} official=${stats.officialDisclosed}`,
    `[headcount-check] OK disclosed=${headcount.disclosed}/${headcount.totalJobs} job=${headcount.jobLevel} program=${headcount.programLevel}`,
    `[publication-check] OK known=${publication.known}/${publication.totalJobs}`
  ];
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const { failures, ...summary } = evaluateJobIntelligence(mod.discoveryMeta, {
    previous: { compensation: readPreviousStat('compensation'), publication: readPreviousStat('publication') }
  });
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  for (const line of jobIntelligenceSummary(summary)) console.log(line);
}
