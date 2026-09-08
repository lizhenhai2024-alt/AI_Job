import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEcoflowJob } from '../scripts/job-discovery/ecoflow.mjs';

const source = {
  company: '正浩创新EcoFlow',
  url: 'https://jobs.ecoflow.com/602892',
  graduationYear: '2027'
};

test('normalizes EcoFlow official 2027 campus role', () => {
  const job = parseEcoflowJob(source, {
    url: 'https://jobs.ecoflow.com/602892/m/position/123456789/detail',
    title: 'GTM',
    body: '2027届秋季校园招聘 深圳 英语可作为工作语言，负责海外市场、用户洞察与跨文化协同。'
  }, new Date('2026-09-08T00:00:00Z'));
  assert.equal(job.company, '正浩创新EcoFlow');
  assert.equal(job.city, '深圳');
  assert.equal(job.graduationYear, '2027');
  assert.equal(job.sourceType, 'official');
  assert.equal(job.verification, '官方招聘官网');
  assert.ok(job.roleFamily.includes('GTM'));
  assert.ok(job.preferenceTags.includes('国际业务'));
  assert.ok(job.sourceUrl.includes('/position/123456789/detail'));
});

test('EcoFlow technical title stays outside target role families', () => {
  const job = parseEcoflowJob(source, {
    url: 'https://jobs.ecoflow.com/602892/m/position/999/detail',
    title: '嵌入式软件工程师',
    body: '2027届秋季校园招聘 深圳 负责嵌入式软件开发。'
  });
  assert.deepEqual(job.roleFamily, ['其他']);
});
