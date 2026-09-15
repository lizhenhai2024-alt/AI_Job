import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerOfJob,
  isSourceRefreshUnhealthy,
  retainedJobsForUnhealthySources,
  isRetentionFresh,
  parseLiveJobsModule
} from '../scripts/job-discovery/snapshot-retention.mjs';

const NOW = new Date('2026-09-16T00:00:00Z');

test('provider detection recognizes HotJob and major existing source families', () => {
  assert.equal(providerOfJob({ source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/SU1/pb/posDetail.html' }), 'hotjob');
  assert.equal(providerOfJob({ source: '公司官方北森校招官网', sourceUrl: 'https://x.zhiye.com/campus/detail' }), 'beisen');
  assert.equal(providerOfJob({ source: '牛客公开职位', sourceUrl: 'https://www.nowcoder.com/jobs/detail/1' }), 'nowcoder');
});

test('source result with errors is an unhealthy replacement snapshot even when partial jobs exist', () => {
  assert.equal(isSourceRefreshUnhealthy({ jobs: [{ id: 'new' }], stats: { errors: 1, listed: 20 } }), true);
  assert.equal(isSourceRefreshUnhealthy({ jobs: [{ id: 'new' }], stats: { errors: 0, listed: 20 } }), false);
});

test('configured provider missing from a refresh retains only fresh previous jobs', () => {
  const existing = [
    { id: 'h1', source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/a', discoveredAt: '2026-09-15T00:00:00Z' },
    { id: 'b1', source: '公司官方北森校招官网', sourceUrl: 'https://x.zhiye.com/a', discoveredAt: '2026-09-15T00:00:00Z' }
  ];
  const sourceResults = [{ name: 'beisen', jobs: [{ id: 'b2' }], stats: { errors: 0, scannedRows: 10 } }];
  const result = retainedJobsForUnhealthySources(existing, sourceResults, ['beisen', 'hotjob'], { now: NOW });
  assert.deepEqual(result.unhealthy, ['hotjob']);
  assert.deepEqual(result.retained.map((x) => x.id), ['h1']);
});

test('unhealthy source keeps a recent snapshot but does not keep it indefinitely', () => {
  const fresh = { id: 'fresh', source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/fresh', discoveredAt: '2026-09-10T00:00:00Z' };
  const stale = { id: 'stale', source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/stale', discoveredAt: '2026-08-01T00:00:00Z' };
  const sourceResults = [{ name: 'hotjob', jobs: [], stats: { portals: 1, scannedPortals: 0, listed: 0, errors: 1 } }];
  const result = retainedJobsForUnhealthySources([fresh, stale], sourceResults, ['hotjob'], { now: NOW, maxAgeDays: 14 });
  assert.deepEqual(result.retained.map((job) => job.id), ['fresh']);
  assert.equal(isRetentionFresh(stale, NOW, 14), false);
});

test('expired deadlines and records without freshness evidence are never retained', () => {
  assert.equal(isRetentionFresh({ discoveredAt: '2026-09-15T00:00:00Z', deadline: '2026-09-01' }, NOW), false);
  assert.equal(isRetentionFresh({ source: '公司官方Moka校招官网' }, NOW), false);
});

test('live-jobs module parser can recover an older provider snapshot from git text', () => {
  const jobs = parseLiveJobsModule(`// generated\nexport const liveJobs = [\n  {"id":"hotjob-old","source":"公司官方HotJob校招官网"}\n];\n\nexport const discoveryMeta = {"updatedAt":"x"};\n`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'hotjob-old');
});
