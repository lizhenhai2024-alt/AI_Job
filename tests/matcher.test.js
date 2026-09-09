import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateJob, rankJobs } from '../src/core/matcher.js';
import { defaultProfile } from '../src/data/profile.js';
import { demoJobs } from '../src/data/jobs.js';

const profileWithEvidence = {
  ...defaultProfile,
  experienceEvidence: [
    { name: '海外业务校园项目', keywords: ['海外','市场','项目','跨文化','客户'], evidence: '真实项目经历' },
    { name: '内容运营校园经历', keywords: ['内容','运营','文案'], evidence: '真实校园经历' }
  ]
};

function alignedOfficialJob(overrides = {}) {
  return {
    ...demoJobs[0],
    company: '安克创新',
    source: '公司官方招聘官网',
    sourceType: 'official',
    sourceUrl: 'https://example.com/job/1',
    verification: '官方招聘官网 · JD明确2027届',
    roleFamily: ['海外运营','GTM'],
    city: defaultProfile.targetCities[0],
    graduationYear: defaultProfile.graduationYear,
    skills: [...defaultProfile.skills],
    languages: [...defaultProfile.languages],
    experienceKeywords: ['海外','市场','项目','跨文化','客户'],
    preferenceTags: [...defaultProfile.workPreference],
    riskTags: [],
    candidateFit: {
      warnings: [], strengths: ['专业不限','职责：跨文化沟通','职责：国际业务'], penalty: 0, bonus: 0,
      major: { verdict: '友好', label: '专业不限', evidence: ['专业不限'] },
      responsibility: { verdict: '语言/商务主导', business: ['跨文化沟通','国际业务'], technical: [] },
      hardRequirements: [], eligibilityEvidence: ['招聘对象：2027届'],
      decisionSteps: [
        { step: 1, label: '专业范围', verdict: '友好', detail: '专业不限' },
        { step: 2, label: '职责动词', verdict: '语言/商务主导', detail: '跨文化沟通、国际业务' },
        { step: 3, label: '硬技术/资格', verdict: '未发现硬门槛', detail: '无' }
      ]
    },
    ...overrides
  };
}

test('V3 ranks an aligned role above a hard-gated pure-sales role', () => {
  const ranked = rankJobs(demoJobs, profileWithEvidence);
  const top = ranked[0];
  const sales = ranked.find((job) => job.id === 'demo-sales');
  assert.ok(top.match.score > sales.match.score);
  assert.equal(sales.match.gate.passed, false);
  assert.equal(sales.match.priority, '不建议投');
});

test('V3 score is bounded from 0 to 100', () => {
  for (const job of demoJobs) {
    const result = evaluateJob(job, defaultProfile);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.equal(result.version, 'V3');
  }
});

test('graduation mismatch fails eligibility gate and caps recommendation', () => {
  const job = alignedOfficialJob();
  const match = evaluateJob(job, profileWithEvidence);
  const mismatch = evaluateJob(job, { ...profileWithEvidence, graduationYear: '2026' });
  assert.ok(match.score > mismatch.score);
  assert.equal(mismatch.eligibility.cohortMatch, false);
  assert.equal(mismatch.gate.passed, false);
  assert.equal(mismatch.tier, 'B');
  assert.ok(mismatch.score < 50);
});

test('empty preference arrays do not crash V3 matcher', () => {
  const blank = {
    graduationYear: '', targetRoles: [], targetCities: [], skills: [], languages: [],
    experienceKeywords: [], experienceEvidence: [], exclusions: [], workPreference: []
  };
  const result = evaluateJob(demoJobs[0], blank);
  assert.equal(typeof result.score, 'number');
  assert.equal(result.dimensions.length, 5);
  assert.ok(['S','A','B'].includes(result.tier));
});

test('V3 dimensions are the agreed 25/20/25/20/10 model and sum to 100', () => {
  const result = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  assert.deepEqual(result.dimensions.map((d) => [d.key, d.weight]), [
    ['responsibility', 25],
    ['majorLanguage', 20],
    ['evidence', 25],
    ['career', 20],
    ['quality', 10]
  ]);
  assert.equal(result.dimensions.reduce((sum, d) => sum + d.weight, 0), 100);
  assert.equal(Object.keys(result.breakdown).length, 5);
});

test('S tier requires official provenance and strong traceable evidence', () => {
  const result = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  assert.ok(result.score >= 80, `expected >=80, got ${result.score}`);
  assert.equal(result.tier, 'S');
  assert.equal(result.priority, '优先投');
  assert.ok(result.experienceEvidence.directMatches.length > 0);
});

test('without structured real experience evidence an otherwise strong role cannot become S', () => {
  const result = evaluateJob(alignedOfficialJob(), { ...profileWithEvidence, experienceEvidence: [] });
  assert.notEqual(result.tier, 'S');
  assert.equal(result.experienceEvidence.configured, false);
});

test('secondary source remains capped below S and explicitly requires official verification', () => {
  const secondary = alignedOfficialJob({
    source: '牛客公开职位', sourceType: 'secondary', verification: '二手来源，待官网核验'
  });
  const result = evaluateJob(secondary, profileWithEvidence);
  assert.notEqual(result.tier, 'S');
  assert.match(result.tierLabel, /官网核验|A档|B档/);
  const quality = result.dimensions.find((item) => item.key === 'quality');
  assert.match(quality.detail, /二手来源/);
});

test('official provenance produces a higher quality score than an equivalent secondary source', () => {
  const official = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  const secondary = evaluateJob(alignedOfficialJob({ sourceType: 'secondary', verification: '二手来源，待官网核验' }), profileWithEvidence);
  assert.ok(official.breakdown.quality.score > secondary.breakdown.quality.score);
});

test('adjacent target titles including ITG overseas business and trade operations receive strong responsibility fit', () => {
  const cases = [
    ['社媒运营（日语）', '内容运营'],
    ['KOL运营（西语）', '内容运营'],
    ['电商运营（Charging）', '电商运营'],
    ['欧洲品牌经理（英国，西班牙，意大利）', '产品营销'],
    ['海外业务岗(J13645)', '国际业务'],
    ['贸易运营岗(J13647)', '贸易运营']
  ];
  for (const [title, targetRole] of cases) {
    const job = alignedOfficialJob({ title, roleFamily: ['其他'] });
    const result = evaluateJob(job, { ...profileWithEvidence, targetRoles: [targetRole] });
    const role = result.dimensions.find((item) => item.key === 'responsibility');
    assert.ok(role.ratio >= 0.9, `${title} should strongly match ${targetRole}, got ${role.ratio}`);
  }
});

test('default profile covers verified international-trade and non-technical role families', () => {
  for (const role of ['PMO','项目管理','项目运营','GTM','产品营销','电商运营','内容运营','产品运营','用户运营','业务运营','海外业务','贸易运营']) {
    assert.ok(defaultProfile.targetRoles.includes(role), `missing target role: ${role}`);
  }
});

test('soft major disadvantage lowers V3 score and is visible as risk', () => {
  const neutral = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  const disadvantaged = evaluateJob(alignedOfficialJob({
    candidateFit: {
      ...alignedOfficialJob().candidateFit,
      major: { verdict: '降权', label: '商科/市场专业主导', evidence: ['市场营销专业优先'] },
      warnings: ['商科/市场知识底子更占优'], penalty: 12
    },
    riskTags: ['适配风险：商科/市场知识底子更占优']
  }), profileWithEvidence);
  assert.ok(disadvantaged.score < neutral.score);
  assert.ok(disadvantaged.riskAdjustment.penalty > 0);
  assert.ok(disadvantaged.gaps.some((x) => x.includes('商科/市场知识底子更占优')));
});

test('long-term overseas assignment is a risk deduction, not an automatic hard gate', () => {
  const result = evaluateJob(alignedOfficialJob({ riskTags: ['长期驻外'] }), profileWithEvidence);
  assert.equal(result.gate.passed, true);
  assert.ok(result.riskAdjustment.items.some((item) => item.label === '长期驻外'));
  assert.ok(result.riskAdjustment.penalty >= 10);
});

test('friendly responsibility signals remain visible in explainable V3 output', () => {
  const result = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  assert.ok(result.highlights.some((x) => x.includes('英语专业友好')));
  assert.equal(result.fourStepAnalysis.length, 5);
  assert.equal(result.fourStepAnalysis[3].label, '真实经历');
  assert.equal(result.fourStepAnalysis[4].label, '投递价值');
  assert.equal(result.fitAdjustment, 0);
});

test('one generic keyword is weak evidence and is never presented as direct experience', () => {
  const profile = {
    ...defaultProfile,
    experienceEvidence: [{ name: '普通项目经历', keywords: ['项目','志愿服务'], evidence: '真实经历' }]
  };
  const job = alignedOfficialJob({ experienceKeywords: ['项目'], skills: [], preferenceTags: [] });
  const result = evaluateJob(job, profile);
  assert.equal(result.experienceEvidence.verdict, '有弱相关经历证据');
  assert.equal(result.experienceEvidence.directMatches.length, 0);
  assert.notEqual(result.tier, 'S');
});

test('configured evidence does not fabricate a match when no signals overlap', () => {
  const profile = {
    ...defaultProfile,
    experienceEvidence: [{ name: '翻译志愿服务', keywords: ['翻译','志愿服务'], evidence: '真实经历' }]
  };
  const job = alignedOfficialJob({
    title: '供应链计划岗', roleFamily: ['供应链运营'],
    experienceKeywords: ['供应链','清关','物流'], skills: ['Excel'], preferenceTags: [],
    candidateFit: {
      ...alignedOfficialJob().candidateFit,
      responsibility: { verdict: '偏语言/商务', business: ['物流执行'], technical: [] },
      strengths: [], warnings: []
    }
  });
  const result = evaluateJob(job, profile);
  assert.equal(result.experienceEvidence.verdict, '没有直接经历证据');
  assert.equal(result.experienceEvidence.matches.length, 0);
  assert.ok(result.gaps.includes('缺少强直接经历证据'));
});

test('visibleByDefault follows the V3 55-point eligible recommendation floor', () => {
  const good = evaluateJob(alignedOfficialJob(), profileWithEvidence);
  const blocked = evaluateJob({ ...demoJobs.find((job) => job.id === 'demo-sales') }, profileWithEvidence);
  assert.equal(good.visibleByDefault, true);
  assert.equal(blocked.visibleByDefault, false);
});
