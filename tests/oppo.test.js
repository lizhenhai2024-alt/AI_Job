import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOppoJob, searchOppoJobs, isOppoInternRow, isOppoGraduateRow } from '../scripts/job-discovery/oppo.mjs';
import { shouldKeep } from '../scripts/job-discovery/core.mjs';

const source = {
  company: 'OPPO',
  url: 'https://careers.oppo.com/university/oppo/campus/post',
  apiBase: 'https://careers.oppo.com',
  tenantId: 1000,
  graduationYear: '2027',
  pageSize: 50,
  maxPages: 10,
  maxJobs: 400,
  projectId: 30
};
const profile = {
  graduationYear: '2027',
  roleKeywords: ['海外运营','产品运营','产品营销','电商运营','用户运营','业务运营','市场','GTM','招聘','人力资源'],
  keywords: ['英语','海外','运营','数据分析','营销','品牌'],
  targetCities: ['深圳','上海','北京','东莞'],
  strongExclude: ['软件工程师','实习'],
  minRelevanceScore: 4
};

const graduateRow = {
  idRecruitPosition: 1816,
  projectId: 30,
  projectName: '2027届应届生校园招聘',
  recruitmentTypeName: '应届生',
  recruitmentType: 'Graduate',
  positionTypeName: '品牌策划类',
  positionName: '产品营销经理（海外-小语种）',
  positionDesc: '1. 负责海外市场产品营销策划与落地，协同区域团队推进上市节奏。\n2. 输出竞品与用户洞察，支持社媒与媒介投放。',
  positionRequire: '1. 英语可作为工作语言，小语种加分。\n2. 具备跨文化沟通与项目管理能力。',
  workCityName: '深圳市',
  releaseTime: '2026-07-15'
};

test('normalizes OPPO official 2027 graduate marketing role', () => {
  const job = parseOppoJob(source, graduateRow, new Date('2026-09-11T00:00:00Z'));
  assert.equal(job.company, 'OPPO');
  assert.equal(job.city, '深圳');
  assert.equal(job.graduationYear, '2027');
  assert.equal(job.sourceType, 'official');
  assert.equal(job.jobDescription.startsWith('1. 负责海外市场'), true);
  assert.match(job.jobRequirements, /英语可作为工作语言/);
  assert.ok(job.roleFamily.includes('产品营销'));
  assert.ok(job.languages.includes('英语'));
  assert.ok(job.preferenceTags.includes('国际业务'));
  assert.equal(job.sourceUrl, 'https://careers.oppo.com/university/oppo/campus/post/1816');
});

test('maps English OPPO titles and HR category into target families', () => {
  const pmm = parseOppoJob(source, {
    ...graduateRow,
    idRecruitPosition: 1851,
    positionName: 'Product Marketing Manager',
    workCityName: 'Gurugram,东莞市'
  });
  assert.ok(pmm.roleFamily.includes('产品营销'));
  assert.equal(pmm.city, '东莞');

  const hr = parseOppoJob(source, {
    ...graduateRow,
    idRecruitPosition: 1782,
    positionTypeName: '综合职能类',
    positionName: '人力资源经理',
    workCityName: '东莞市'
  });
  assert.ok(hr.roleFamily.includes('HR'));
});

test('keeps OPPO non-STEM marketing jobs that explicitly say 非理工科', () => {
  const job = parseOppoJob(source, {
    ...graduateRow,
    idRecruitPosition: 1787,
    positionName: '营销策划经理 （非理工科类_手机方向）',
    positionRequire: '本岗位主要面向非理工科学生，具备营销专业或营销相关实习经历者优先。英语沟通能力佳。'
  }, new Date('2026-09-11T00:00:00Z'));
  assert.ok(job.roleFamily.includes('产品营销'));
  assert.equal(shouldKeep(job, profile, new Date('2026-09-11T00:00:00Z')), true);
});

test('treats intern project rows as internships, not 2027 graduate jobs', () => {
  const intern = {
    ...graduateRow,
    idRecruitPosition: 9,
    projectId: 29,
    projectName: '2027届寻梦实习招聘',
    recruitmentTypeName: '实习生',
    recruitmentType: 'Intern',
    positionName: '社媒运营经理（小语种方向）'
  };
  assert.equal(isOppoInternRow(intern), true);
  assert.equal(isOppoGraduateRow(intern), false);
  assert.equal(isOppoGraduateRow(graduateRow), true);
});

test('OPPO discovery uses Tenant-Id, graduate project filter, and skips intern rows', async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body, headers: init.headers || {} });
    if (url.endsWith('/openapi/position/project/list')) {
      return new Response(JSON.stringify({
        code: 0,
        data: [
          { idRecruitProject: 29, projectName: '2027届寻梦实习招聘', recruitmentType: 'Intern', recruitmentTypeName: '实习生' },
          { idRecruitProject: 30, projectName: '2027届应届生校园招聘', recruitmentType: 'Graduate', recruitmentTypeName: '应届生' },
          { idRecruitProject: 31, projectName: '2027届博士生招聘', recruitmentType: 'doctor', recruitmentTypeName: '博士生' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/openapi/position/pageNew')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.projectList, [{
        projectId: 30,
        recruitmentType: 'Graduate',
        isAllNode: 'Y',
        themeList: []
      }]);
      const records = body.pageNum === 1
        ? [
          graduateRow,
          { ...graduateRow, idRecruitPosition: 1769, positionName: '电池算法工程师', positionTypeName: 'AI/算法类', positionDesc: '算法开发', positionRequire: '计算机专业' },
          { ...graduateRow, idRecruitPosition: 99, projectName: '2027届寻梦实习招聘', recruitmentType: 'Intern', recruitmentTypeName: '实习生', positionName: '社媒运营实习' }
        ]
        : [];
      return new Response(JSON.stringify({
        code: 0,
        data: { records, total: records.length, pages: 1, size: 50, current: body.pageNum }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await searchOppoJobs(profile, source, { fetcher, maxJobs: 20, now: new Date('2026-09-11T00:00:00Z') });
  assert.equal(result.stats.pages, 1);
  assert.equal(result.stats.listed, 3);
  assert.equal(result.stats.internRejected, 1);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.snapshotComplete, true);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '产品营销经理（海外-小语种）');
  assert.equal(calls[0].headers['Tenant-Id'], '1000');
  assert.equal(calls[1].method, 'POST');
});
