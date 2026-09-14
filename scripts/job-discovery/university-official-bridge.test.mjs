import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFromUniversityJob } from './university-official-bridge.mjs';
import { keepProductionJobs, isTrustedUniversityOfficialBacked } from '../filter-official-live-jobs.mjs';

test('BYD university discovery is retained and queued for custom adapter', () => {
  const byd = {
    id: 'university-byd',
    company: '比亚迪股份有限公司',
    title: '27届应届生',
    graduationYear: '2027',
    sourceType: 'secondary',
    sourceChannel: 'university',
    sourceUrl: 'https://scc.hnu.edu.cn/detail/career?id=708874',
    officialCareerUrl: 'https://job.byd.com/',
    universitySource: { school: '湖南大学' }
  };
  assert.equal(isTrustedUniversityOfficialBacked(byd), true);
  assert.deepEqual(keepProductionJobs([byd]), [byd]);
  const bridge = sourceFromUniversityJob(byd);
  assert.equal(bridge.state, 'needs_adapter');
  assert.match(bridge.reason, /job\.byd\.com/);
});

test('university record without explicit official career URL stays out of production', () => {
  const secondary = {
    company: '示例公司',
    graduationYear: '2027',
    sourceType: 'secondary',
    sourceChannel: 'university',
    universitySource: { school: '湖南大学' }
  };
  assert.equal(isTrustedUniversityOfficialBacked(secondary), false);
  assert.equal(keepProductionJobs([secondary]).length, 0);
});

test('known ATS discovered by university can auto-register', () => {
  const moka = {
    company: '示例科技',
    graduationYear: '2027',
    sourceType: 'secondary',
    sourceChannel: 'university',
    officialCareerUrl: 'https://app.mokahr.com/campus-recruitment/example/12345',
    universitySource: { school: '湖南大学' }
  };
  const bridge = sourceFromUniversityJob(moka);
  assert.equal(bridge.state, 'source_registered');
  assert.equal(bridge.provider, 'moka');
  assert.equal(bridge.source.graduationYear, '2027');
});
