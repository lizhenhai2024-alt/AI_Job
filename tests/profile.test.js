import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/data/profile.js';

test('default profile is grounded in resume evidence', () => {
  for (const skill of ['英语','Excel','PPT','跨部门沟通','竞品分析','Gate评审','变更流程','翻译','本地化','双语沟通','ChatGPT','Claude']) {
    assert.ok(defaultProfile.skills.includes(skill), `missing resume-backed skill: ${skill}`);
  }
  for (const unsupported of ['Jira','Confluence','DTC','Shopify','Amazon','TikTok Shop']) {
    assert.equal(defaultProfile.skills.includes(unsupported), false, `unsupported skill should not be claimed: ${unsupported}`);
  }
});

test('discovery profile never hard-excludes candidate roles', () => {
  assert.deepEqual(defaultProfile.exclusions, [], 'AI_Job discovery layer must not pre-hide roles before CareerPilot Eligibility/JD analysis');
  for (const formerlyFiltered of ['工程师', '实施', '实习', '销售', '驻外']) {
    assert.equal(defaultProfile.exclusions.includes(formerlyFiltered), false, `${formerlyFiltered} must be evaluated downstream, not hidden by discovery profile`);
  }
});

test('real experience evidence is structured and traceable', () => {
  assert.ok(Array.isArray(defaultProfile.experienceEvidence));
  assert.ok(defaultProfile.experienceEvidence.length >= 6);
  const names = defaultProfile.experienceEvidence.map((item) => item.name);
  for (const expected of ['汽车零部件产品管理实习','轨道交通海外业务实习','博物馆双语讲解','翻译实习','校园组织与志愿服务','AI 商业策划项目']) {
    assert.ok(names.includes(expected), `missing experience evidence: ${expected}`);
  }
  for (const item of defaultProfile.experienceEvidence) {
    assert.ok(item.evidence && item.evidence.length > 10, `${item.name} needs concrete evidence`);
    assert.ok(Array.isArray(item.keywords) && item.keywords.length > 0, `${item.name} needs match keywords`);
  }
});
