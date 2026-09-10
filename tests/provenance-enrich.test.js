import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichProvenanceFields, normalizeSourceEvidence } from '../src/core/source-provenance.js';
import { resolveMokaCardTitle } from '../scripts/job-discovery/moka.mjs';
import { parseHotjobDetail } from '../scripts/job-discovery/hotjob.mjs';
import { isPlausibleUniversityJob } from '../scripts/job-discovery/university.mjs';

test('provenance enrichment backfills sourceChannel and sourceEvidence for official ATS records', () => {
  const job = {
    company: '示例企业',
    title: '海外市场运营（2027届）',
    source: '公司官方北森校招官网',
    sourceType: 'official',
    sourceUrl: 'https://example.zhiye.com/position/1',
    verification: '官方招聘官网 · 2027届'
  };
  const enriched = enrichProvenanceFields(job);
  assert.equal(enriched.sourceChannel, 'official_ats');
  assert.equal(enriched.sourceChannelLabel, '公司官方校招官网 / ATS 系统');
  assert.ok(Array.isArray(enriched.sourceEvidence));
  assert.ok(enriched.sourceEvidence.some((row) => row.label === job.source && row.url === job.sourceUrl));
  assert.ok(enriched.sourceEvidence.some((row) => row.label === job.verification));
});

test('provenance enrichment backfills sourceChannel for nowcoder secondary records', () => {
  const enriched = enrichProvenanceFields({
    company: '示例企业',
    title: '运营专员',
    source: '牛客公开职位',
    sourceType: 'secondary',
    sourceUrl: 'https://www.nowcoder.com/job/1',
    verification: '二手来源，待官网核验'
  });
  assert.equal(enriched.sourceChannel, 'referral');
  assert.ok(enriched.sourceEvidence.length >= 2);
});

test('normalizeSourceEvidence merges label/url and kind/value rows and dedupes', () => {
  const rows = normalizeSourceEvidence({
    source: '高校就业信息网',
    sourceUrl: 'https://job.edu.cn/detail/1',
    verification: '官方发布 · 待公司官网复核',
    sourceEvidence: [
      { label: '高校就业信息网', url: 'https://job.edu.cn/detail/1' },
      { kind: 'url', value: 'https://job.edu.cn/detail/1' }
    ]
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.label === '高校就业信息网' && row.url).length, 1);
  assert.ok(rows.some((row) => row.label === '来源链接' && row.url === 'https://job.edu.cn/detail/1'));
});

test('Moka card title skips urgent tag lines like 急', () => {
  const lines = ['急', '电商规则运营专员（南京）-2027届', '发布于 2026-09-09', '全职', '江苏·南京市'];
  assert.equal(resolveMokaCardTitle(lines), '电商规则运营专员（南京）-2027届');
  assert.equal(resolveMokaCardTitle(['海外运营管培生']), '海外运营管培生');
  assert.equal(resolveMokaCardTitle([]), '');
});

test('HotJob trustCohort2027 marks generic campus project as 2027', () => {
  const source = { company: 'Decathlon', tenant: 't1', trustCohort2027: true };
  const job = parseHotjobDetail(source, { postId: 'p1', postName: '迪卡侬线上运营主管（校园招聘）--上海' }, {
    postId: 'p1',
    postName: '迪卡侬线上运营主管（校园招聘）--上海',
    projectName: '校园招聘',
    workContent: '制定品类年度计划与线上运营策略',
    serviceCondition: '本科及以上',
    workPlaceStr: '上海',
    endDate: '2026-12-20 23:59:59'
  });
  assert.equal(job.graduationYear, '2027');
  assert.match(job.verification, /官网核验2027届入口/);
});

test('HotJob without trustCohort2027 keeps strict 2027 evidence requirement', () => {
  const source = { company: '德勤中国', tenant: 't2' };
  const job = parseHotjobDetail(source, { postId: 'p2', postName: '业务分析师' }, {
    postId: 'p2',
    postName: '业务分析师',
    projectName: 'Campus 2026',
    workContent: '数据分析',
    serviceCondition: '本科',
    workPlaceStr: '上海',
    endDate: '2026-11-30 23:59:59'
  });
  assert.equal(job.graduationYear, '');
});

test('university placeholder records like 招聘信息 are rejected', () => {
  assert.equal(isPlausibleUniversityJob({ company: '招聘信息', title: '招聘信息' }, { school: '南开大学' }), false);
  assert.equal(isPlausibleUniversityJob({ company: '北京展心展力信息科技有限公司', title: 'MetaApp 2027届 校园招聘简章' }, { school: '北京语言大学' }), true);
});
