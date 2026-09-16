import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyFromProjectName,
  parseProjectPage,
  parseLiepinJobPage,
  shouldKeepLiepin,
  dedupeLiepinJobs
} from '../scripts/job-discovery/liepin.mjs';

// 项目详情页 HTML 样本（字段结构基于真实猎聘页面：meta description 项目名 + lptjob 链接）
const PROJECT_HTML = `
<html><head><meta name="description" content="猎聘校园为广大在校生提供富冶集团2027届校园招聘的详细信息，包括富冶集团2027届校园招聘的项目名称、项目介绍或企业介绍、富冶集团2027届校园招聘所有校招岗位信息、校招流程、宣讲会信息、以及该企业的网申入口。" /></head>
<body>
  <h2 class="campus-section-title">校招职位</h2>
  <div class="hot-jobs">
    <li><a href="https://www.liepin.com/lptjob/85433503/" target="_blank" title="产品经理-泰语(000919)招聘">产品经理-泰语(000919)招聘</a></li>
    <li><a href="https://www.liepin.com/lptjob/85609363/" target="_blank" title="计划工程师招聘">计划工程师招聘</a></li>
    <li><a href="https://www.liepin.com/lptjob/85620601/" target="_blank" title="电商运营专员招聘">电商运营专员招聘</a></li>
  </div>
</body></html>`;

// 岗位详情页 HTML 样本（真实页面结构：title 页 + 面包屑 + 字段行 + 职责/资格）
const JOB_HTML = `
<html><head>
<title>【惠州 计划工程师招聘】-深圳信立泰药业股份有限公司惠州招聘信息-猎聘</title>
<meta name="description" content="深圳信立泰药业股份有限公司惠州招聘计划工程师岗位，薪资8-13k，岗位要求本科学历，应届相关经验。" />
</head>
<body>
<div class="common-current-position">
  <a href="https://www.liepin.com/city-huizhou/">惠州招聘网</a> <span>></span>
  <a href="https://www.liepin.com/job/1985609363.shtml">计划工程师招聘</a>
</div>
<section>
  <div class="job-title">计划工程师</div>
  <div class="job-salary">8-13k</div>
  <div class="job-city">惠州-惠阳区</div>
  <div class="job-meta">应届 本科 学生可投</div>
  <div class="job-hc">招1人</div>
  <div class="job-time">9月14日更新</div>
  <div class="job-desc">
    职位介绍
    职责描述: 1、根据销售计划、研发产品计划及市场需求，编制年度/月度生产计划并审核、控制日常生产进度；
    任职资格: 1、本科应届生，药学相关专业；2、具备良好的沟通、应变、适应及分析问题能力。
    截止日期：2027年09月14日
    招聘人数：1人
    公司简介
  </div>
</section>
</body></html>`;

test('companyFromProjectName strips cohort suffixes', () => {
  assert.equal(companyFromProjectName('富冶集团2027届校园招聘'), '富冶集团');
  assert.equal(companyFromProjectName('中国太平保险集团2027秋季校招'), '中国太平保险集团');
  assert.equal(companyFromProjectName('浙商证券2027届秋季校园招聘'), '浙商证券');
});

test('parseProjectPage extracts company from meta description and job links', () => {
  const { company, projectName, jobs } = parseProjectPage(PROJECT_HTML, 'https://www.liepin.com/campus/project-detail/1/');
  assert.equal(company, '富冶集团');
  assert.match(projectName, /富冶集团2027届校园招聘/);
  assert.equal(jobs.length, 3);
  assert.equal(jobs[0].title, '产品经理-泰语(000919)');
  assert.equal(jobs[2].title, '电商运营专员');
});

test('parseLiepinJobPage extracts full structured fields', () => {
  const job = parseLiepinJobPage({
    html: JOB_HTML,
    url: 'https://www.liepin.com/lptjob/85609363/',
    now: new Date('2026-09-16T08:00:00+08:00')
  });
  assert.equal(job.company, '深圳信立泰药业股份有限公司');
  assert.equal(job.title, '计划工程师');
  assert.equal(job.city, '惠州');
  assert.equal(job.salary, '8-13k');
  assert.equal(job.headCount, 1);
  assert.equal(job.publishedAt, '2026-09-14');
  assert.equal(job.deadline, '2027-09-14');
  // 猎聘页面多用"应届 本科"而非"2027届"字样，毕业年份为空属常态（由 shouldKeepLiepin 兜底保留）
  assert.equal(job.graduationYear, '');
  assert.match(job.jobRequirements, /药学相关专业/);
  assert.equal(job.source, '猎聘校园');
  assert.equal(job.sourceType, 'secondary');
  assert.ok(job.id.startsWith('liepin-'));
});

test('shouldKeepLiepin keeps 2027 campus roles and drops internships', () => {
  const base = {
    closed: false,
    title: '电商运营专员',
    _recruitType: '校招',
    graduationYear: '2027'
  };
  assert.equal(shouldKeepLiepin({ ...base, title: '2027届运营岗' }), true);
  assert.equal(shouldKeepLiepin({ ...base, title: '运营实习生', _recruitType: '实习' }), false);
  assert.equal(shouldKeepLiepin({ ...base, title: '运营岗', _recruitType: '校招', graduationYear: '' }), true);
});

test('shouldKeepLiepin drops daily-wage (internship) salaries', () => {
  const job = parseLiepinJobPage({
    html: JOB_HTML.replace('>8-13k<', '>150-250元/天<'),
    url: 'https://www.liepin.com/lptjob/85609363/',
    now: new Date('2026-09-16T08:00:00+08:00')
  });
  assert.equal(job.salary, '150-250元/天');
  assert.equal(shouldKeepLiepin(job, { graduationYear: '2027' }), false);
});

test('dedupeLiepinJobs dedupes by company|title|city', () => {
  const jobs = [
    { id: 'a', company: 'X', title: '运营', city: '深圳', publishedAt: '2026-09-10' },
    { id: 'b', company: 'X', title: '运营', city: '深圳', publishedAt: '2026-09-11' },
    { id: 'c', company: 'X', title: '运营', city: '上海', publishedAt: '' }
  ];
  const out = dedupeLiepinJobs(jobs);
  assert.equal(out.length, 2);
  assert.ok(out.some((j) => j.id === 'b'));
});
