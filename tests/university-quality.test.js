import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlausibleUniversityCompany, isPlausibleUniversityJob, parseUniversityJobPage } from '../scripts/job-discovery/university.mjs';

const source = {
  school: '湖南大学',
  listUrls: ['https://scc.hnu.edu.cn/'],
  segments: ['985'],
  priority: 100
};

function html(title, body = '') {
  return `<html><head><title>${title}</title></head><body><h1>${title}</h1><div>${body}</div></body></html>`;
}

test('rejects employment-office placeholders and notice prose as company entities', () => {
  assert.equal(isPlausibleUniversityCompany('就业办2019', source), false);
  assert.equal(isPlausibleUniversityCompany('关于做好', source), false);
  assert.equal(isPlausibleUniversityCompany('感谢贵单位一直以来对北京语言大学就业创业工作的大力支持和对我校毕业生的关注厚爱！', source), false);
  assert.equal(isPlausibleUniversityCompany('湖南大学', source), false);
});

test('keeps legitimate company entities', () => {
  assert.equal(isPlausibleUniversityCompany('小米集团', source), true);
  assert.equal(isPlausibleUniversityCompany('招商银行股份有限公司长沙分行', source), true);
  assert.equal(isPlausibleUniversityCompany('惠州市德赛西威汽车电子股份有限公司', source), true);
});

test('strips 工商查询 suffix but still rejects employment office pseudo company', () => {
  const job = parseUniversityJobPage({
    html: html('宣讲单位：就业办2019 工商查询', '宣讲单位：就业办2019 工商查询 2027届 校园招聘'),
    url: 'https://scc.hnu.edu.cn/detail/career?id=bad',
    source,
    now: new Date('2026-09-10T00:00:00Z')
  });
  assert.equal(job.company, '待核公司');
  assert.equal(isPlausibleUniversityJob(job, source), false);
});

test('rejects generic university notices rather than treating them as recruitment companies', () => {
  const job = parseUniversityJobPage({
    html: html('关于做好2027届毕业生一次性求职补贴申报工作的通知', '2027届毕业生一次性求职补贴申报'),
    url: 'https://scc.hnu.edu.cn/detail/notice?id=1',
    source,
    now: new Date('2026-09-10T00:00:00Z')
  });
  assert.equal(isPlausibleUniversityJob(job, source), false);
});

test('keeps a real company campus recruitment announcement', () => {
  const job = parseUniversityJobPage({
    html: html('小米集团2027届全球校园招聘正式启动', '公司名称：小米通讯技术有限公司 招聘对象：2027届 本科及以上 英语'),
    url: 'https://scc.hnu.edu.cn/detail/career?id=xiaomi',
    source,
    now: new Date('2026-09-10T00:00:00Z')
  });
  assert.equal(job.company, '小米通讯技术有限公司');
  assert.equal(isPlausibleUniversityJob(job, source), true);
});
