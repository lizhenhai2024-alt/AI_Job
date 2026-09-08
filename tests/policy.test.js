import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternshipJob,
  isEngineeringOrImplementationJob,
  requiresMandatoryStem,
  requiresHardTechnicalAbility,
  requiresProfessionalCertificate,
  analyzeCandidateFit,
  shouldExcludeByPolicy
} from '../scripts/job-discovery/policy.mjs';

test('internship titles are excluded in Chinese and English', () => {
  const titles = [
    '电商实习生（Charging）',
    '【日常实习】服务运营实习生',
    '暑期实习岗位-市场运营',
    'GTM Intern',
    'Product Marketing Internship'
  ];
  for (const title of titles) assert.equal(isInternshipJob({ title }), true, title);
});

test('full-time campus roles are not mistaken for internships', () => {
  const titles = ['GTM Product Manager', '项目管理岗-2027校招', '海外市场专员', '产品运营'];
  for (const title of titles) assert.equal(isInternshipJob({ title }), false, title);
});

test('engineer and implementation titles are excluded', () => {
  for (const title of ['海外市场工程师', '解决方案工程师', '项目实施顾问', '实施项目经理']) {
    assert.equal(isEngineeringOrImplementationJob({ title }), true, title);
    assert.equal(shouldExcludeByPolicy({ title }), true, title);
  }
});

test('mandatory STEM requirements are excluded', () => {
  const jobs = [
    { title: '项目管理岗', _searchText: '本科及以上学历，理工科相关专业；负责项目进度管理。' },
    { title: '产品运营', _searchText: '任职要求：要求计算机、电子信息或自动化相关专业。' },
    { title: '市场分析', _searchText: '专业要求：统计、数学、计算机等理工类专业。' }
  ];
  for (const job of jobs) {
    assert.equal(requiresMandatoryStem(job), true, job._searchText);
    assert.equal(shouldExcludeByPolicy(job), true, job._searchText);
  }
});

test('STEM preferred wording is retained but marked as disadvantage', () => {
  const jobs = [
    { title: '产品运营', _searchText: '专业不限，理工科优先；英语可作为工作语言。' },
    { title: 'GTM专员', _searchText: '计算机或电子背景者优先，非硬性要求。' },
    { title: '项目管理', _searchText: '不限专业，工科背景优先考虑。' }
  ];
  for (const job of jobs) {
    assert.equal(requiresMandatoryStem(job), false, job._searchText);
    assert.equal(shouldExcludeByPolicy(job), false, job._searchText);
  }
  assert.ok(analyzeCandidateFit(jobs[1]).warnings.includes('专业背景不占优'));
});

test('major lists without English or broad humanities are soft disadvantage signals', () => {
  const jd = { title: '市场营销岗', _searchText: '市场营销、新闻传播、广告、商科等相关学科背景优先；负责品牌活动。' };
  const fit = analyzeCandidateFit(jd);
  assert.equal(shouldExcludeByPolicy(jd), false);
  assert.ok(fit.warnings.includes('专业背景不占优'));
  assert.ok(fit.penalty >= 10);
});

test('hard technical capability requirements are excluded while preferred tech is retained', () => {
  const hard = { title: '产品经理', _searchText: '要求熟练使用SQL，具备数据建模和算法分析能力，深刻理解模型理论。' };
  const soft = { title: '产品经理', _searchText: 'SQL或Python能力优先，有Agent产品经验加分。' };
  assert.equal(requiresHardTechnicalAbility(hard), true);
  assert.equal(shouldExcludeByPolicy(hard), true);
  assert.equal(requiresHardTechnicalAbility(soft), false);
  assert.equal(shouldExcludeByPolicy(soft), false);
  assert.ok(analyzeCandidateFit(soft).warnings.includes('技术背景优先'));
});

test('mandatory professional certificates are excluded while preferred certificates are retained', () => {
  const hard = { title: '财务分析', _searchText: '要求持有CPA或CFA证书。' };
  const soft = { title: '商业分析', _searchText: 'CPA/CFA持证者优先。' };
  assert.equal(requiresProfessionalCertificate(hard), true);
  assert.equal(shouldExcludeByPolicy(hard), true);
  assert.equal(requiresProfessionalCertificate(soft), false);
  assert.equal(shouldExcludeByPolicy(soft), false);
  assert.ok(analyzeCandidateFit(soft).warnings.includes('专业证书优先'));
});

test('related-major masters preferred is retained and downgraded', () => {
  const job = { title: '品牌策略', _searchText: '具有市场营销相关专业硕士学历优先；负责品牌策略。' };
  const fit = analyzeCandidateFit(job);
  assert.equal(shouldExcludeByPolicy(job), false);
  assert.ok(fit.warnings.includes('相关专业硕士优先'));
});

test('English-major friendly JD signals create positive fit evidence', () => {
  const job = {
    title: '国际业务运营',
    _searchText: '专业不限；负责跨部门沟通协调、英文资料整理与翻译、本地化、海外客户接待及国际业务拓展。'
  };
  const fit = analyzeCandidateFit(job);
  assert.equal(shouldExcludeByPolicy(job), false);
  for (const expected of ['专业不限', '沟通协调', '资料整理', '翻译/本地化', '客户沟通', '国际业务']) {
    assert.ok(fit.strengths.includes(expected), `missing friendly signal ${expected}`);
  }
  assert.equal(fit.bonus, 8);
});
