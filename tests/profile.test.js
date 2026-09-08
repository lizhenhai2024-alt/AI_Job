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

test('engineer is not a blanket exclusion after duty-based reasoning upgrade', () => {
  assert.equal(defaultProfile.exclusions.includes('工程师'), false);
  assert.ok(defaultProfile.exclusions.includes('实施'));
  assert.ok(defaultProfile.exclusions.includes('实习'));
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
