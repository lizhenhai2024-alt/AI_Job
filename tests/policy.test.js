import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternshipJob } from '../scripts/job-discovery/policy.mjs';

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
