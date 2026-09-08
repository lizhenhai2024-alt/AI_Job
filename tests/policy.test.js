import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternshipJob,
  isEngineeringOrImplementationJob,
  requiresMandatoryStem,
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

test('STEM preferred wording is retained', () => {
  const jobs = [
    { title: '产品运营', _searchText: '专业不限，理工科优先；英语可作为工作语言。' },
    { title: 'GTM专员', _searchText: '具备计算机或电子背景者优先，非硬性要求。' },
    { title: '项目管理', _searchText: '不限专业，工科背景优先考虑。' }
  ];
  for (const job of jobs) {
    assert.equal(requiresMandatoryStem(job), false, job._searchText);
    assert.equal(shouldExcludeByPolicy(job), false, job._searchText);
  }
});
