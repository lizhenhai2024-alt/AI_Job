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

test('highly aligned job ranks above excluded sales job', () => {
  const ranked = rankJobs(demoJobs, profileWithEvidence);
  const top = ranked[0];
  const sales = ranked.find((job) => job.id === 'demo-sales');
  assert.ok(top.match.score >= 80, `expected top score >= 80, got ${top.match.score}`);
  assert.ok(top.match.score > sales.match.score);
  assert.ok(sales.match.risks.some((risk) => risk.includes('命中排除条件')));
});

test('matching score is bounded from 0 to 100', () => {
  for (const job of demoJobs) {
    const result = evaluateJob(job, defaultProfile);
    assert.ok(result.score >= 0 && result.score <= 100);
  }
});

test('graduation mismatch lowers score and is separately flagged as ineligible', () => {
  const job = demoJobs[0];
  const match = evaluateJob(job, defaultProfile);
  const mismatch = evaluateJob(job, { ...defaultProfile, graduationYear: '2026' });
  assert.ok(match.score > mismatch.score);
  assert.equal(mismatch.eligibility.cohortMatch, false);
  assert.equal(mismatch.tier, 'B');
});

test('empty preference arrays do not crash matcher', () => {
  const blank = {
    graduationYear: '', targetRoles: [], targetCities: [], skills: [], languages: [],
    experienceKeywords: [], experienceEvidence: [], exclusions: [], workPreference: []
  };
  const result = evaluateJob(demoJobs[0], blank);
  assert.equal(typeof result.score, 'number');
  assert.equal(result.dimensions.length, 7);
  assert.ok(['S','A','B'].includes(result.tier));
});

test('all dimension weights sum to 100', () => {
  const result = evaluateJob(demoJobs[0], defaultProfile);
  assert.equal(result.dimensions.reduce((sum, d) => sum + d.weight, 0), 100);
});

test('S tier requires high score, official provenance and traceable real experience evidence', () => {
  const aligned = {
    ...demoJobs[0],
    sourceType: 'official',
    verification: '官方招聘官网',
    roleFamily: ['海外运营','GTM'],
    city: defaultProfile.targetCities[0],
    graduationYear: defaultProfile.graduationYear,
    skills: [...defaultProfile.skills],
    languages: [...defaultProfile.languages],
    experienceKeywords: [...defaultProfile.experienceKeywords],
    preferenceTags: [...defaultProfile.workPreference],
    riskTags: []
  };
  const result = evaluateJob(aligned, profileWithEvidence);
  assert.ok(result.score >= 85);
  assert.equal(result.tier, 'S');
  assert.ok(result.experienceEvidence.matches.length > 0);
});

test('without structured real experience evidence a high-score role is capped at A', () => {
  const aligned = {
    ...demoJobs[0],
    sourceType: 'official', verification: '官方招聘官网',
    roleFamily: ['海外运营','GTM'], city: defaultProfile.targetCities[0],
    graduationYear: defaultProfile.graduationYear,
    skills: [...defaultProfile.skills], languages: [...defaultProfile.languages],
    experienceKeywords: [...defaultProfile.experienceKeywords], preferenceTags: [...defaultProfile.workPreference],
    riskTags: []
  };
  const result = evaluateJob(aligned, defaultProfile);
  assert.ok(result.score >= 85);
  assert.equal(result.tier, 'A');
  assert.equal(result.experienceEvidence.configured, false);
});

test('high score from secondary source is capped at A tier until official verification', () => {
  const aligned = {
    ...demoJobs[0],
    sourceType: 'secondary',
    verification: '二手来源，待官网核验',
    roleFamily: ['海外运营','GTM'],
    city: defaultProfile.targetCities[0],
    graduationYear: defaultProfile.graduationYear,
    skills: [...defaultProfile.skills],
    languages: [...defaultProfile.languages],
    experienceKeywords: [...defaultProfile.experienceKeywords],
    preferenceTags: [...defaultProfile.workPreference],
    riskTags: []
  };
  const result = evaluateJob(aligned, profileWithEvidence);
  assert.ok(result.score >= 85);
  assert.equal(result.tier, 'A');
});

test('adjacent target titles receive full role-direction credit even when crawler taxonomy is 其他', () => {
  const cases = [
    ['社媒运营（日语）', '内容运营'],
    ['KOL运营（西语）', '内容运营'],
    ['电商实习生（Charging）', '电商运营'],
    ['欧洲品牌经理实习（英国，西班牙，意大利）', '产品营销']
  ];
  for (const [title, targetRole] of cases) {
    const job = { ...demoJobs[0], title, roleFamily: ['其他'] };
    const result = evaluateJob(job, { ...defaultProfile, targetRoles: [targetRole] });
    const role = result.dimensions.find((item) => item.label === '岗位方向');
    assert.equal(role.ratio, 1, `${title} should match ${targetRole}`);
  }
});

test('default profile covers the main non-technical campus role families', () => {
  for (const role of ['PMO','项目管理','项目运营','GTM','产品营销','电商运营','内容运营','产品运营','用户运营','业务运营']) {
    assert.ok(defaultProfile.targetRoles.includes(role), `missing target role: ${role}`);
  }
});

test('soft major disadvantage lowers score and blocks S tier', () => {
  const base = {
    ...demoJobs[0],
    sourceType: 'official', verification: '官方招聘官网',
    roleFamily: ['产品营销'], city: defaultProfile.targetCities[0],
    graduationYear: defaultProfile.graduationYear,
    skills: [...defaultProfile.skills], languages: [...defaultProfile.languages],
    experienceKeywords: [...defaultProfile.experienceKeywords], preferenceTags: [...defaultProfile.workPreference],
    riskTags: []
  };
  const neutral = evaluateJob(base, profileWithEvidence);
  const disadvantaged = evaluateJob({
    ...base,
    candidateFit: { warnings: ['商科/市场知识底子更占优'], strengths: [], penalty: 12, bonus: 0 },
    riskTags: ['适配风险：商科/市场知识底子更占优']
  }, profileWithEvidence);
  assert.ok(disadvantaged.score < neutral.score);
  assert.notEqual(disadvantaged.tier, 'S');
  assert.ok(disadvantaged.gaps.some((x) => x.includes('商科/市场知识底子更占优')));
});

test('friendly responsibility signals create visible evidence', () => {
  const job = {
    ...demoJobs[0],
    candidateFit: {
      warnings: [],
      strengths: ['专业不限','职责：跨文化沟通','职责：国际业务'],
      penalty: 0,
      bonus: 6,
      responsibility: { business: ['跨文化沟通','国际业务'], technical: [] },
      decisionSteps: [
        { step: 1, label: '专业范围', verdict: '友好', detail: '专业不限' },
        { step: 2, label: '职责动词', verdict: '语言/商务主导', detail: '跨文化沟通、国际业务' },
        { step: 3, label: '硬技术/资格', verdict: '未发现硬门槛', detail: '无' }
      ]
    }
  };
  const result = evaluateJob(job, profileWithEvidence);
  assert.equal(result.fitAdjustment, 6);
  assert.ok(result.highlights.some((x) => x.includes('英语专业友好')));
  assert.equal(result.fourStepAnalysis.length, 4);
  assert.equal(result.fourStepAnalysis[3].label, '真实经历');
});

test('configured experience evidence does not fabricate a match', () => {
  const profile = {
    ...defaultProfile,
    experienceEvidence: [{ name: '翻译志愿服务', keywords: ['翻译','志愿服务'], evidence: '真实经历' }]
  };
  const job = {
    ...demoJobs[0],
    experienceKeywords: ['供应链','清关','物流'],
    skills: ['Excel'],
    candidateFit: { responsibility: { business: ['物流执行'], technical: [] }, warnings: [], strengths: [], penalty: 0, bonus: 0 }
  };
  const result = evaluateJob(job, profile);
  assert.equal(result.experienceEvidence.verdict, '没有直接经历证据');
  assert.equal(result.experienceEvidence.matches.length, 0);
  assert.ok(result.gaps.includes('没有直接经历证据'));
});
