import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeituanJob } from '../scripts/job-discovery/meituan.mjs';
import { parseXiaohongshuJob } from '../scripts/job-discovery/xiaohongshu.mjs';

const NOW = new Date('2026-09-16T00:00:00Z');

test('Meituan normalized JD uses per-role jobDuty/jobRequirement, not aggregate description', () => {
  const job = parseMeituanJob({ company: '美团', graduationYear: '2027', url: 'https://zhaopin.meituan.com/web/campus' }, {
    jobUnionId: 'm1',
    name: '商品运营岗',
    cityList: [{ name: '广州' }],
    jobDuty: '<p>负责本岗位商品运营、价格分析与经营数据复盘。</p>',
    jobRequirement: '<p>本科及以上，专业不限，具备数据分析和跨部门协作能力。</p>',
    // Decoy: this field can contain page/program-level text and must never replace the per-role duty.
    jobDescription: '岗位A：技术开发。岗位B：供应链。岗位C：销售运营。'.repeat(30)
  }, NOW);

  assert.equal(job.jobDescription, '负责本岗位商品运营、价格分析与经营数据复盘。');
  assert.equal(job.jobRequirements, '本科及以上，专业不限，具备数据分析和跨部门协作能力。');
  assert.doesNotMatch(job.jobDescription, /岗位A/);
});

test('Xiaohongshu normalized JD uses per-role duty/qualification, not aggregate description fields', () => {
  const job = parseXiaohongshuJob({ company: '小红书', graduationYear: '2027', url: 'https://job.xiaohongshu.com/campus/position' }, {
    positionId: 'x1',
    positionName: '【2027校招】规则运营',
    workplace: '上海',
    duty: '<p>负责本岗位规则运营、策略梳理与跨团队推进。</p>',
    qualification: '<p>本科及以上，逻辑清晰，具备数据意识和沟通协作能力。</p>',
    // Decoys: these must not leak into the normalized per-role JD.
    description: '岗位甲职责。岗位乙职责。岗位丙职责。'.repeat(30),
    requirement: '岗位甲要求。岗位乙要求。岗位丙要求。'.repeat(30)
  }, NOW);

  assert.equal(job.jobDescription, '负责本岗位规则运营、策略梳理与跨团队推进。');
  assert.equal(job.jobRequirements, '本科及以上，逻辑清晰，具备数据意识和沟通协作能力。');
  assert.doesNotMatch(job.jobDescription, /岗位甲/);
  assert.doesNotMatch(job.jobRequirements, /岗位甲/);
});
