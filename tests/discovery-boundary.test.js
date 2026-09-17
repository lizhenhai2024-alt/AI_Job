import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { shouldKeep } from '../scripts/job-discovery/core.mjs';
import { keepProductionJobs, isOutOfScopeProfessionalRole, hardOutOfScopeMajorClauses } from '../scripts/filter-official-live-jobs.mjs';
import { toQueryJob } from '../scripts/build-query-layer.mjs';

const profile = { graduationYear: '2027', roleKeywords: ['运营'], keywords: ['英语'], targetCities: ['深圳'], strongExclude: ['软件工程师', '销售经理'], minRelevanceScore: 99 };
const now = new Date('2026-09-16T00:00:00Z');

async function source(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('discovery parser may see broad roles, but production scope filters professional roles before retention', () => {
  assert.equal(shouldKeep({ graduationYear: '2027', title: '软件工程师', city: '北京' }, profile, now), true);
  assert.equal(isOutOfScopeProfessionalRole({ title: '软件工程师', jobRequirements: '计算机相关专业' }), true);
  assert.equal(isOutOfScopeProfessionalRole({ title: '财务分析师', jobRequirements: '财务、会计相关专业' }), true);
  assert.equal(isOutOfScopeProfessionalRole({ title: '审计助理', jobRequirements: '审计、会计相关专业' }), true);
  assert.equal(isOutOfScopeProfessionalRole({ title: '国际项目管理', jobRequirements: '本科及以上，专业不限，英语流利' }), false);
  assert.equal(isOutOfScopeProfessionalRole({ title: '海外市场', jobRequirements: '市场营销或英语专业优先' }), false);
});

test('CATL-style engineering PM clause keeps the base STEM requirement hard', () => {
  const job = {
    title: '项目管理工程师',
    jobRequirements: '本科及以上学历；专业要求：理工科背景，化学、材料学、汽车、机械等相关专业优先；英语CET-4。'
  };
  assert.equal(isOutOfScopeProfessionalRole(job), true);
  assert.deepEqual(hardOutOfScopeMajorClauses(job), ['专业要求：理工科背景']);

  const query = toQueryJob({
    ...job,
    company: '宁德时代',
    graduationYear: '2027',
    sourceType: 'official',
    jdEvidence: {
      majorClauses: ['专业要求：理工科背景，化学、材料学、汽车、机械等相关专业优先']
    }
  });
  assert.equal(query.major.hardRestriction, true);
  assert.ok(query.major.hardClauses.some((x) => x.includes('理工科背景')));
});

test('soft STEM preference stays soft when there is no hard STEM base gate', () => {
  const job = {
    title: '项目管理专员',
    jobRequirements: '本科及以上，理工科背景优先；英语或管理类专业亦可。'
  };
  assert.equal(isOutOfScopeProfessionalRole(job), false);
  assert.deepEqual(hardOutOfScopeMajorClauses(job), []);
});

test('English ability does not cancel a hard STEM major gate', () => {
  const job = {
    title: '项目管理工程师',
    jobRequirements: '理工科背景，英语听说读写熟练。'
  };
  assert.equal(isOutOfScopeProfessionalRole(job), true);
});

test('production source policy keeps company official first plus trusted university supplement, while dropping professional roles', () => {
  const rows = keepProductionJobs([
    { company: 'A', title: '海外运营', graduationYear: '2027', sourceType: 'official' },
    { company: 'T', title: '算法工程师', graduationYear: '2027', sourceType: 'official', jobRequirements: '计算机相关专业' },
    { company: 'F', title: '税务顾问', graduationYear: '2027', sourceType: 'official', jobRequirements: '税务、会计相关专业' },
    {
      company: 'B', title: '国际业务', graduationYear: '2027', sourceType: 'secondary',
      sourceChannel: 'university', officialCareerUrl: 'https://careers.example.com',
      universitySource: { school: '示例大学' }
    },
    { company: 'C', title: '普通二手岗位', graduationYear: '2027', sourceType: 'secondary', sourceChannel: 'platform' }
  ]);
  assert.deepEqual(rows.map((x) => x.company), ['A', 'B']);
});

test('hard technical major without candidate-friendly alternative is out of scope, soft preference is not', () => {
  assert.equal(isOutOfScopeProfessionalRole({
    title: '项目运营',
    jobRequirements: '要求机械、电气相关专业背景；负责项目计划与跨部门推进。'
  }), true);
  assert.equal(isOutOfScopeProfessionalRole({
    title: '项目运营',
    jobRequirements: '机械、管理、英语等相关专业优先；负责项目计划与跨部门推进。'
  }), false);
});

test('basic discovery validity gate still rejects non-target cohort, internships and expired roles', () => {
  assert.equal(shouldKeep({ graduationYear: '2026', title: '海外运营' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营实习生' }, profile, now), false);
  assert.equal(shouldKeep({ graduationYear: '2027', title: '海外运营', deadline: '2026-09-01' }, profile, now), false);
});

test('production refresh extracts job facts but never candidate-fit verdicts', async () => {
  const [refresh, university] = await Promise.all([
    source('scripts/refresh-jobs.mjs'),
    source('scripts/job-discovery/refresh-university-jobs.mjs')
  ]);
  for (const text of [refresh, university]) {
    assert.doesNotMatch(text, /enrichCandidateFit/);
    assert.doesNotMatch(text, /analyzeCandidateFit/);
    assert.doesNotMatch(text, /jobPolicyReasons/);
    assert.match(text, /resolveJdEvidence/);
    assert.match(text, /jdEvidence/);
  }
});

test('university official bridge does not blacklist whole industries by company category; role-level scope is handled later', async () => {
  const text = await source('scripts/job-discovery/university-official-bridge.mjs');
  assert.doesNotMatch(text, /EXCLUDED_CATEGORIES/);
  assert.doesNotMatch(text, /银行\|证券\|保险\|信托\|基金\|期货\|军工\|审计\|咨询/);
});
