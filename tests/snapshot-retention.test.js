import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerOfJob,
  isSourceRefreshUnhealthy,
  retainedJobsForUnhealthySources,
  parseLiveJobsModule
} from '../scripts/job-discovery/snapshot-retention.mjs';

test('provider detection recognizes HotJob and major existing source families', () => {
  assert.equal(providerOfJob({ source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/SU1/pb/posDetail.html' }), 'hotjob');
  assert.equal(providerOfJob({ source: '公司官方北森校招官网', sourceUrl: 'https://x.zhiye.com/campus/detail' }), 'beisen');
  assert.equal(providerOfJob({ source: '牛客公开职位', sourceUrl: 'https://www.nowcoder.com/jobs/detail/1' }), 'nowcoder');
});

test('source result with errors is an unhealthy replacement snapshot even when partial jobs exist', () => {
  assert.equal(isSourceRefreshUnhealthy({ jobs: [{ id: 'new' }], stats: { errors: 1, listed: 20 } }), true);
  assert.equal(isSourceRefreshUnhealthy({ jobs: [{ id: 'new' }], stats: { errors: 0, listed: 20 } }), false);
});

test('configured provider missing from a refresh retains its previous jobs', () => {
  const existing = [
    { id: 'h1', source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/a' },
    { id: 'b1', source: '公司官方北森校招官网', sourceUrl: 'https://x.zhiye.com/a' }
  ];
  const sourceResults = [{ name: 'beisen', jobs: [{ id: 'b2' }], stats: { errors: 0, scannedRows: 10 } }];
  const result = retainedJobsForUnhealthySources(existing, sourceResults, ['beisen', 'hotjob']);
  assert.deepEqual(result.unhealthy, ['hotjob']);
  assert.deepEqual(result.retained.map((x) => x.id), ['h1']);
});

test('unhealthy HotJob keeps last known jobs while fresh partial rows can still be merged later', () => {
  const existing = [{ id: 'old', source: '公司官方HotJob校招官网', sourceUrl: 'https://wecruit.hotjob.cn/old' }];
  const sourceResults = [{ name: 'hotjob', jobs: [], stats: { portals: 1, scannedPortals: 0, listed: 0, errors: 1 } }];
  const result = retainedJobsForUnhealthySources(existing, sourceResults, ['hotjob']);
  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0].id, 'old');
});

test('live-jobs module parser can recover an older provider snapshot from git text', () => {
  const jobs = parseLiveJobsModule(`// generated\nexport const liveJobs = [\n  {"id":"hotjob-old","source":"公司官方HotJob校招官网"}\n];\n\nexport const discoveryMeta = {"updatedAt":"x"};\n`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, 'hotjob-old');
});
