import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateJob, rankJobs } from '../src/core/matcher.js';
import { defaultProfile } from '../src/data/profile.js';
import { demoJobs } from '../src/data/jobs.js';

test('highly aligned job ranks above excluded sales job', () => {
  const ranked = rankJobs(demoJobs, defaultProfile);
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

test('graduation mismatch lowers score', () => {
  const job = demoJobs[0];
  const match = evaluateJob(job, defaultProfile);
  const mismatch = evaluateJob(job, { ...defaultProfile, graduationYear: '2026' });
  assert.ok(match.score > mismatch.score);
});

test('empty preference arrays do not crash matcher', () => {
  const blank = {
    graduationYear: '', targetRoles: [], targetCities: [], skills: [], languages: [],
    experienceKeywords: [], exclusions: [], workPreference: []
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

test('S tier requires high score, no hard exclusion and official provenance', () => {
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
  const result = evaluateJob(aligned, defaultProfile);
  assert.ok(result.score >= 85);
  assert.equal(result.tier, 'S');
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
  const result = evaluateJob(aligned, defaultProfile);
  assert.ok(result.score >= 85);
  assert.equal(result.tier, 'A');
});
