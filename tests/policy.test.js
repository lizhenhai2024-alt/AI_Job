import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternshipJob,
  isPureSalesJob,
  isEngineeringOrImplementationJob,
  requiresMandatoryStem,
  requiresHardTechnicalAbility,
  requiresProfessionalCertificate,
  analyzeMajorOrientation,
  analyzeResponsibilityOrientation,
  isTechnicalDutyDominant,
  analyzeCandidateFit,
  shouldExcludeByPolicy
} from '../scripts/job-discovery/policy.mjs';

test('internship titles are excluded in Chinese and English', () => {
  const titles = [
    '电商实习生（Charging）',
    '【日常实习】服务运营实习生',
    '暑期实习岗位-市场运营',
    '2027校招/实习-海外市场',
    'GTM Intern',
    'Product Marketing Internship'
  ];
  for (const title of titles) assert.equal(isInternshipJob({ title }), true, title);
});

test('internship recruit metadata is excluded even when title is generic', () => {
  assert.equal(isInternshipJob({ title: '市场运营', _recruitType: '实习' }), true);
  assert.equal(isInternshipJob({ title: '品牌营销', _subject: '暑期实习项目' }), true);
});

test('full-time campus roles are not mistaken for internships', () => {
  const titles = ['GTM Product Manager', '项目管理岗-2027校招', '海外市场专员', '产品运营'];
  for (const title of titles) assert.equal(isInternshipJob({ title }), false, title);
});

test('pure-sales titles are centrally excluded without blocking sales operations', () => {
  const excluded = ['销售管培生', '海外销售专员', '渠道销售经理', '国际销售代表'];
  for (const title of excluded) {
    assert.equal(isPureSalesJob({ title }), true, title);
    assert.equal(shouldExcludeByPolicy({ title }), true, title);
  }
  const retained = ['销售运营', '销售支持专员', '销售数据分析', '销售策略运营'];
  for (const title of retained) {
    assert.equal(isPureSalesJob({ title }), false, title);
    assert.equal(shouldExcludeByPolicy({ title }), false, title);
  }
});

test('existing pure-sales risk tag still feeds the unified policy', () => {
  assert.equal(isPureSalesJob({ title: '业务拓展岗', riskTags: ['纯销售'] }), true);
  assert.equal(shouldExcludeByPolicy({ title: '业务拓展岗', riskTags: ['纯销售'] }), true);
});

test('only unambiguous technical engineer or implementation titles are title-excluded', () => {
  for (const title of ['质量工程师', '软件工程师', '项目实施顾问', '实施项目经理']) {
    assert.equal(isEngineeringOrImplementationJob({ title }), true, title);
  }
  for (const title of ['国际物流工程师', '海外市场工程师', '商务工程师']) {
    assert.equal(isEngineeringOrImplementationJob({ title }), false, title);
  }
});

test('mandatory STEM requirements are excluded', () => {
  const jobs = [
    { title: '项目管理岗', _searchText: '任职要求：本科及以上学历，理工科相关专业。' },
    { title: '产品运营', _searchText: '任职要求：要求计算机、电子信息或自动化相关专业。' },
    { title: '市场分析', _searchText: '专业要求：统计、数学、计算机等理工类专业。' }
  ];
  for (const job of jobs) {
    assert.equal(requiresMandatoryStem(job), true, job._searchText);
    assert.equal(shouldExcludeByPolicy(job), true, job._searchText);
  }
});

test('preferred technical majors are retained and downgraded rather than excluded', () => {
  const job = { title: 'GTM专员', _searchText: '任职要求：计算机、电子信息等工科背景优先；英语可作为工作语言。' };
  const major = analyzeMajorOrientation(job);
  const fit = analyzeCandidateFit(job);
  assert.equal(major.verdict, '降权');
  assert.equal(shouldExcludeByPolicy(job), false);
  assert.ok(fit.warnings.includes('技术专业背景更占优'));
});

test('market and business major list is a disadvantage when it excludes language and broad social majors', () => {
  const jd = { title: '市场营销岗', _searchText: '任职要求：市场营销、新闻传播、广告、商科等相关学科背景优先；岗位职责：负责品牌活动策划。' };
  const major = analyzeMajorOrientation(jd);
  const fit = analyzeCandidateFit(jd);
  assert.equal(major.verdict, '降权');
  assert.equal(major.label, '商科/市场专业主导');
  assert.equal(shouldExcludeByPolicy(jd), false);
  assert.ok(fit.warnings.includes('商科/市场知识底子更占优'));
  assert.ok(fit.penalty >= 10);
});

test('international commerce style major list is compatible with humanities and social sciences', () => {
  const jd = {
    title: '海外商务专员',
    _searchText: '任职要求：国际贸易、商务英语、国际商务、市场营销、法律、经济管理等相关专业优先。岗位职责：负责商务测算、合同起草审核、跨文化沟通、维护客户关系。'
  };
  const major = analyzeMajorOrientation(jd);
  const duties = analyzeResponsibilityOrientation(jd);
  const fit = analyzeCandidateFit(jd);
  assert.equal(major.verdict, '兼容');
  assert.equal(duties.verdict, '语言/商务主导');
  assert.equal(shouldExcludeByPolicy(jd), false);
  assert.ok(fit.strengths.includes('文科/社科专业范围兼容'));
  assert.ok(fit.strengths.some((item) => item.includes('商务测算')));
});

test('responsibility verbs identify technical role even when title sounds international', () => {
  const jd = {
    title: '海外市场质量岗位',
    _searchText: '岗位职责：识别判断问题根因，统筹质量方案，完成技术评估和质量改进；任职要求：英语六级。'
  };
  const duties = analyzeResponsibilityOrientation(jd);
  assert.equal(duties.verdict, '技术主导');
  assert.equal(isTechnicalDutyDominant(jd), true);
  assert.equal(shouldExcludeByPolicy(jd), true);
});

test('international logistics engineer is retained when duties are business execution', () => {
  const jd = {
    title: '国际物流工程师',
    _searchText: '岗位职责：负责订舱、清关、报关单证存档、物流流程执行与跨部门沟通。任职要求：专业不限，英语可作为工作语言。'
  };
  const duties = analyzeResponsibilityOrientation(jd);
  assert.equal(isEngineeringOrImplementationJob(jd), false);
  assert.equal(duties.verdict, '语言/商务主导');
  assert.equal(shouldExcludeByPolicy(jd), false);
});

test('hard technical capability requirements are excluded while preferred tech is retained', () => {
  const hard = { title: '产品经理', _searchText: '任职要求：要求熟练使用SQL，具备数据建模和算法分析能力，深刻理解模型理论。' };
  const soft = { title: '产品经理', _searchText: '任职要求：SQL或Python能力优先，有Agent产品经验加分。' };
  assert.equal(requiresHardTechnicalAbility(hard), true);
  assert.equal(shouldExcludeByPolicy(hard), true);
  assert.equal(requiresHardTechnicalAbility(soft), false);
  assert.equal(shouldExcludeByPolicy(soft), false);
  assert.ok(analyzeCandidateFit(soft).warnings.includes('技术背景优先'));
});

test('mandatory professional certificates are excluded while preferred certificates are retained', () => {
  const hard = { title: '财务分析', _searchText: '任职要求：要求持有CPA或CFA证书。' };
  const soft = { title: '商业分析', _searchText: '任职要求：CPA/CFA持证者优先。' };
  assert.equal(requiresProfessionalCertificate(hard), true);
  assert.equal(shouldExcludeByPolicy(hard), true);
  assert.equal(requiresProfessionalCertificate(soft), false);
  assert.equal(shouldExcludeByPolicy(soft), false);
  assert.ok(analyzeCandidateFit(soft).warnings.includes('专业证书优先'));
});

test('related-major masters preferred is retained and downgraded', () => {
  const job = { title: '品牌策略', _searchText: '任职要求：具有市场营销相关专业硕士学历优先；岗位职责：负责品牌策略。' };
  const fit = analyzeCandidateFit(job);
  assert.equal(shouldExcludeByPolicy(job), false);
  assert.ok(fit.warnings.includes('相关专业硕士优先'));
});

test('professional flexibility and business duties create positive evidence', () => {
  const job = {
    title: '国际业务运营',
    _searchText: '岗位职责：负责跨部门沟通协调、英文资料整理与翻译、本地化、海外客户接待及国际业务拓展。任职要求：专业不限。'
  };
  const fit = analyzeCandidateFit(job);
  assert.equal(shouldExcludeByPolicy(job), false);
  assert.ok(fit.strengths.includes('专业不限'));
  assert.ok(fit.strengths.some((item) => item.includes('跨文化沟通')));
  assert.ok(fit.strengths.some((item) => item.includes('翻译/本地化')));
  assert.ok(fit.bonus > 0);
});

test('cohort evidence is stored separately from professional fit', () => {
  const job = {
    title: '海外商务专员-2027校招',
    graduationYear: '2027',
    deadline: '2026-10-31',
    _searchText: '招聘对象：2027届毕业生，毕业时间为2026年9月至2027年8月。岗位职责：客户沟通。任职要求：专业不限。'
  };
  const fit = analyzeCandidateFit(job);
  assert.ok(fit.eligibilityEvidence.includes('招聘对象：2027届'));
  assert.ok(fit.eligibilityEvidence.includes('毕业时间窗口：2026-09 至 2027-08'));
  assert.ok(fit.eligibilityEvidence.includes('投递截止：2026-10-31'));
});
