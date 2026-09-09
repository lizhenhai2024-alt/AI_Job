import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceChannel,
  intelligenceCompleteness,
  languageRequirementSignal,
  provenanceSummary
} from '../src/core/source-provenance.js';

test('official ATS sources are classified as official_ats', () => {
  const job = { source: 'Moka 官方校招门户', sourceType: 'official', verification: '官方招聘官网', sourceUrl: 'https://example.mokahr.com/campus_apply' };
  assert.equal(classifySourceChannel(job), 'official_ats');
  assert.equal(provenanceSummary(job).verificationLabel, '官方源');
});

test('university employment notices are classified as university channel', () => {
  const job = { source: '湖南大学就业信息网官方招聘简章', sourceUrl: 'https://scc.hnu.edu.cn/detail/news?id=1' };
  assert.equal(classifySourceChannel(job), 'university');
});

test('nowcoder and maimai discovery remains a referral/discovery channel unless official evidence upgrades it', () => {
  assert.equal(classifySourceChannel({ source: '牛客公开职位', sourceUrl: 'https://www.nowcoder.com/jobs/detail/1' }), 'referral');
  assert.equal(classifySourceChannel({ source: '脉脉认证内推帖', sourceUrl: 'https://maimai.cn/article/1' }), 'referral');
});

test('social announcements are classified separately from job-level ATS sources', () => {
  assert.equal(classifySourceChannel({ source: '公司官方公众号校招公告', sourceUrl: 'https://mp.weixin.qq.com/s/abc' }), 'social_official');
});

test('cross-source evidence requires distinct origins and does not produce a fit score', () => {
  const result = provenanceSummary({
    source: '高校就业网', sourceType: 'secondary', sourceUrl: 'https://career.example.edu.cn/a',
    sourceEvidence: [
      { label: '高校就业网详情', url: 'https://career.example.edu.cn/a' },
      { label: '公司官方职位', url: 'https://jobs.company.example/campus/1' }
    ]
  });
  assert.equal(result.crossVerified, true);
  assert.equal(result.verificationLabel, '多源交叉核实');
  assert.equal('score' in result, false);
  assert.equal('tier' in result, false);
});

test('detail and list pages from the same university are not treated as cross-source verification', () => {
  const result = provenanceSummary({
    source: '某大学就业信息网', sourceType: 'secondary', sourceUrl: 'https://career.example.edu.cn/detail/1',
    sourceEvidence: [
      { label: '某大学就业信息网', url: 'https://career.example.edu.cn/detail/1' },
      { label: '某大学招聘列表', url: 'https://career.example.edu.cn/list' }
    ]
  });
  assert.equal(result.crossVerified, false);
  assert.equal(result.verificationLabel, '待官网复核');
});

test('intelligence completeness counts evidence fields, not candidate match', () => {
  const result = intelligenceCompleteness({ company:'A', title:'海外运营', city:'深圳', graduationYear:'2027', sourceUrl:'https://x', deadline:'2026-10-01', description:'JD' });
  assert.deepEqual(result, { filled: 7, total: 7, missing: [] });
});

test('mandatory minor-language text is only emitted as a discovery warning signal', () => {
  const result = languageRequirementSignal({ title:'欧洲运营', description:'要求西班牙语可作为工作语言' });
  assert.equal(result.level, 'warning');
  assert.match(result.label, /交由最终看板判定/);
});
