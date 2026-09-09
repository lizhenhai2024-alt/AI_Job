import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_INTAKE_MARKER,
  createCompanyIntake,
  buildCompanyIntakeIssueBody,
  buildCompanyIntakeIssueUrl,
  normalizeCareerUrl
} from '../src/core/company-intake.js';
import { buildCompanyRegistry } from '../src/data/company-registry.js';

test('company intake normalizes user input and preserves useful focus fields', () => {
  const request = createCompanyIntake({
    name: '  追觅科技  ',
    careerUrl: 'https://dreame.zhiye.com/',
    focus: '海外运营、GTM、海外运营',
    note: '优先找英语可发挥的岗位'
  }, new Date('2026-09-09T03:00:00Z'));
  assert.equal(request.name, '追觅科技');
  assert.equal(request.careerUrl, 'https://dreame.zhiye.com/');
  assert.deepEqual(request.focus, ['海外运营','GTM']);
  assert.equal(request.status, '待提交分析');
  assert.ok(request.key);
});

test('company intake rejects missing company name and ignores unsafe/non-http career URLs', () => {
  assert.throws(() => createCompanyIntake({ name: '   ' }), /公司名称不能为空/);
  assert.equal(normalizeCareerUrl('javascript:alert(1)'), '');
  assert.equal(normalizeCareerUrl('not-a-url'), '');
});

test('company intake issue is machine readable and points to the project issue form', () => {
  const request = createCompanyIntake({ name: '测试公司', careerUrl: 'https://example.com/campus', focus: ['国际业务'], note: '测试' });
  const body = buildCompanyIntakeIssueBody(request);
  assert.ok(body.includes(COMPANY_INTAKE_MARKER));
  assert.ok(body.includes('company: 测试公司'));
  assert.ok(body.includes('career_url: https://example.com/campus'));
  const url = new URL(buildCompanyIntakeIssueUrl(request));
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname, '/lizhenhai2024-alt/AI_Job/issues/new');
  assert.match(url.searchParams.get('title'), /^\[Company Intake\] 测试公司$/);
  assert.ok(url.searchParams.get('body').includes(COMPANY_INTAKE_MARKER));
});

test('user-added companies enter unified registry before an official source is available', () => {
  const registry = buildCompanyRegistry(
    [{ name: '已有公司', status: '主投', industries: ['消费电子'], cities: [], targetTracks: [], evidence: { count: 1 } }],
    [],
    [{ name: '新公司', status: '待发现官方招聘入口', focus: ['海外运营'], requestedAt: '2026-09-09T03:00:00Z', analysis: '等待发现官网' }]
  );
  const added = registry.find((item) => item.name === '新公司');
  assert.ok(added);
  assert.equal(added.userRequested, true);
  assert.equal(added.intakeStatus, '待发现官方招聘入口');
  assert.deepEqual(added.targetTracks, ['海外运营']);
  assert.equal(added.sourceManaged, false);
});

test('a requested company becomes source-managed without duplicating the company record', () => {
  const registry = buildCompanyRegistry(
    [],
    [{ provider: 'moka', company: '测试科技' }],
    [{ name: '测试科技有限公司', status: '已识别官方源，等待岗位刷新', focus: ['GTM'], requestedAt: '2026-09-09T03:00:00Z' }]
  );
  assert.equal(registry.length, 1);
  assert.equal(registry[0].userRequested, true);
  assert.equal(registry[0].sourceManaged, true);
  assert.ok(registry[0].sourceProviders.includes('moka'));
  assert.equal(registry[0].intakeStatus, '官方源已接入');
});
