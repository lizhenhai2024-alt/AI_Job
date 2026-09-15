import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSourceHealth } from '../scripts/job-discovery/source-health.mjs';

test('Beisen is not healthy merely because rows were scanned', () => {
  const health = evaluateSourceHealth('beisen', { company: '示例北森' }, {
    scannedRows: 120,
    keptJobs: 0,
    cohortRejected: 120,
    titleRejected: 0,
    errors: 0
  });
  assert.equal(health.healthy, false);
  assert.equal(health.status, 'no_2027');
});

test('Moka source with only internship-like rows is not considered healthy', () => {
  const health = evaluateSourceHealth('moka', { company: '示例Moka' }, {
    discoveredUrls: 20,
    keptJobs: 0,
    cohortRejected: 0,
    titleRejected: 20,
    errors: 0
  });
  assert.equal(health.healthy, false);
  assert.equal(health.status, 'no_formal_2027');
});

test('HotJob needs at least one current valid 2027 formal job to be healthy', () => {
  const emptyFormal = evaluateSourceHealth('hotjob', { company: '示例HotJob' }, {
    listed: 50,
    detailed: 10,
    keptJobs: 0,
    errors: 0,
    detailErrors: 0
  });
  assert.equal(emptyFormal.healthy, false);
  assert.equal(emptyFormal.status, 'no_formal_2027');

  const healthy = evaluateSourceHealth('hotjob', { company: '示例HotJob' }, {
    listed: 50,
    detailed: 10,
    keptJobs: 3,
    errors: 0,
    detailErrors: 0
  });
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.status, 'healthy');
});
