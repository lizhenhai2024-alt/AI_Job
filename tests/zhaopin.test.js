import test from 'node:test';
import assert from 'node:assert/strict';
import { parseListPage, normalizeSalary, shouldKeepZhaopin, toLiveJob } from '../scripts/job-discovery/zhaopin.mjs';

const LIST_HTML = `
<div class="joblist-box__item clearfix">
  <div class="jobinfo">
    <div class="jobinfo__name-row">
      <a href="http://www.zhaopin.com/jobdetail/CC120135460J40878667607.htm" target="_blank" class="jobinfo__name">2027届产品企划管培生(J11484)</a>
    </div>
    <p class="jobinfo__salary"> 7000-9000元 </p>
    <div class="jobinfo__other-info">
      <div class="jobinfo__other-info-item"><span>北京·朝阳·东湖</span></div>
      <div class="jobinfo__other-info-item"> 经验不限 </div>
      <div class="jobinfo__other-info-item"> 本科 </div>
    </div>
  </div>
  <div class="companyinfo">
    <a title="爱慕股份有限公司" href="https://www.zhaopin.com/companydetail/CZ120135460.htm" target="_blank" class="companyinfo__name companyinfo__name-short"> 爱慕股份有限公司 </a>
  </div>
</div>
<div class="joblist-box__item clearfix">
  <div class="jobinfo">
    <div class="jobinfo__name-row">
      <a href="http://www.zhaopin.com/jobdetail/CC663942480J40802421706.htm" target="_blank" class="jobinfo__name">急聘钳工</a>
    </div>
    <p class="jobinfo__salary"> 6000-8000元 </p>
    <div class="jobinfo__other-info"><div class="jobinfo__other-info-item"><span>上海·嘉定</span></div><div class="jobinfo__other-info-item"> 经验不限 </div></div>
  </div>
  <div class="companyinfo"><a class="companyinfo__name companyinfo__name-short">某机械公司</a></div>
</div>
`;

test('parseListPage extracts full card fields', () => {
  const jobs = parseListPage(LIST_HTML);
  assert.equal(jobs.length, 2);
  const j1 = jobs[0];
  assert.equal(j1.title, '2027届产品企划管培生(J11484)');
  assert.equal(j1.company, '爱慕股份有限公司');
  assert.equal(j1.city, '北京');
  assert.equal(j1.salaryRaw, '7000-9000元');
  assert.ok(j1.id.startsWith('zhaopin-'));
});

test('normalizeSalary converts 元-based ranges to k', () => {
  assert.equal(normalizeSalary('7000-9000元'), '7-9k');
  assert.equal(normalizeSalary('15-20K'), '15-20k');
  assert.equal(normalizeSalary('8000-12000元'), '8-12k');
  assert.equal(normalizeSalary('1-1.8万'), '10-18k');
  assert.equal(normalizeSalary('2.5-3万'), '25-30k');
});

test('shouldKeepZhaopin keeps campus roles and drops non-campus / internships', () => {
  const keep = toLiveJob({ title: '2027届材料开发管培生(J11460)', company: '某公司', city: '深圳', salaryRaw: '10-15k', url: 'https://www.zhaopin.com/jobdetail/CC1.htm' });
  assert.equal(shouldKeepZhaopin(keep), true);
  const drop = toLiveJob({ title: '急聘钳工', company: '某机械公司', city: '上海', salaryRaw: '6-8k', url: 'https://www.zhaopin.com/jobdetail/CC2.htm' });
  assert.equal(shouldKeepZhaopin(drop), false);
  const intern = toLiveJob({ title: '2027届实习生', company: '某公司', city: '深圳', salaryRaw: '2-3k', url: 'https://www.zhaopin.com/jobdetail/CC3.htm' });
  assert.equal(shouldKeepZhaopin(intern), false);
  const outCity = toLiveJob({ title: '2027届运营专员', company: '某公司', city: '成都', salaryRaw: '8-10k', url: 'https://www.zhaopin.com/jobdetail/CC4.htm' });
  assert.equal(shouldKeepZhaopin(outCity), false);
});

test('toLiveJob produces standard secondary structure', () => {
  const j = toLiveJob({ title: '2027届品牌管培生', company: '名创优品', city: '广州', salaryRaw: '8000-12000元', url: 'https://www.zhaopin.com/jobdetail/CC5.htm' });
  assert.equal(j.source, '智联招聘');
  assert.equal(j.sourceType, 'secondary');
  assert.equal(j.graduationYear, '2027');
  assert.equal(j.salary, '8-12k');
  assert.ok(j.sourceUrl.includes('jobdetail'));
});
