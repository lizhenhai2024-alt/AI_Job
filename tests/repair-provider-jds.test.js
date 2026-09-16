import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceProviderJobs,
  validateFreshSnapshot,
  repairProviderSnapshots
} from '../scripts/repair-provider-jds.mjs';

test('provider replacement preserves unrelated jobs and removes stale provider rows', () => {
  const existing = [
    { id: 'meituan-old-1', company: '美团', title: '旧岗位' },
    { id: 'other-1', company: '其他公司', title: '保留岗位' },
    { id: 'meituan-old-2', company: '美团', title: '旧岗位2' }
  ];
  const fresh = [{ id: 'meituan-new-1', company: '美团', title: '新岗位' }];
  const after = replaceProviderJobs(existing, fresh, 'meituan-');
  assert.deepEqual(after.map((x) => x.id).sort(), ['meituan-new-1', 'other-1']);
});

test('repair refuses incomplete, errored or empty official snapshots', () => {
  assert.throws(
    () => validateFreshSnapshot('meituan', { jobs: [{ id: 'x' }], stats: { snapshotComplete: false, errors: 0 } }),
    /incomplete/
  );
  assert.throws(
    () => validateFreshSnapshot('meituan', { jobs: [{ id: 'x' }], stats: { snapshotComplete: true, errors: 1 } }),
    /errors/
  );
  assert.throws(
    () => validateFreshSnapshot('meituan', { jobs: [], stats: { snapshotComplete: true, errors: 0 } }),
    /zero jobs/
  );
});

test('targeted repair replaces only validated providers and keeps per-role JD fields', async () => {
  const provider = {
    key: 'demo',
    idPrefix: 'demo-',
    searcher: async () => ({
      jobs: [{
        id: 'demo-new', company: '示例公司', title: '市场运营', city: '深圳', publishedAt: '2026-09-16',
        jobDescription: '负责单一岗位的海外市场研究、数据复盘、项目推进和跨部门协同。',
        jobRequirements: '本科及以上学历，英语可作为工作语言，具备良好沟通能力。',
        sourceType: 'official', sourceUrl: 'https://example.com/job/demo-new', riskTags: [],
        _searchText: '内部搜索文本不应入库'
      }],
      stats: { snapshotComplete: true, errors: 0 }
    })
  };
  const existing = [
    { id: 'demo-old', company: '示例公司', title: '旧污染岗位', jobDescription: '整站聚合文本' },
    { id: 'keep-1', company: '其他公司', title: '其他岗位', publishedAt: '2026-09-15' }
  ];
  const { jobs, repaired } = await repairProviderSnapshots({
    profile: { graduationYear: '2027' },
    officialSources: { demo: { url: 'https://example.com/campus', graduationYear: '2027' } },
    existingJobs: existing,
    providers: [provider],
    now: new Date('2026-09-16T00:00:00Z')
  });

  assert.deepEqual(repaired.demo, { before: 1, after: 1 });
  assert.equal(jobs.some((x) => x.id === 'demo-old'), false);
  assert.equal(jobs.some((x) => x.id === 'keep-1'), true);
  const fresh = jobs.find((x) => x.id === 'demo-new');
  assert.ok(fresh);
  assert.match(fresh.jobDescription, /单一岗位/);
  assert.equal('_searchText' in fresh, false);
  assert.ok(fresh.jdEvidence && typeof fresh.jdEvidence === 'object');
});
