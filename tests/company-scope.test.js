import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultProfile } from '../src/data/profile.js';

const officialSources = JSON.parse(readFileSync(new URL('../config/official-sources.json', import.meta.url), 'utf8'));
const searchProfile = JSON.parse(readFileSync(new URL('../config/search-profile.json', import.meta.url), 'utf8'));

test('official company pool includes verified 2027 Moka sources', () => {
  const mokaCompanies = officialSources.moka.map((item) => item.company);
  for (const company of ['SHEIN','中兴通讯','雀巢中国','达能','微步在线','华勤技术','搜狐畅游','盛趣游戏','特斯拉中国']) {
    assert.ok(mokaCompanies.includes(company), `missing official Moka source: ${company}`);
  }
  assert.ok(officialSources.moka.length >= 18);
});

test('foreign Moka monitors require per-job 2027 evidence', () => {
  for (const company of ['博世中国','百威中国']) {
    const source = officialSources.moka.find((item) => item.company === company);
    assert.ok(source, `missing foreign monitored source: ${company}`);
    assert.equal(source.graduationYear, '2027');
    assert.equal(source.strictCohort, true, `${company} must not inherit 2027 without JD/title evidence`);
    assert.match(source.url, /^https:\/\/app\.mokahr\.com\//);
  }
});

test('official HotJob pool includes Decathlon campus 2027', () => {
  const source = officialSources.hotjob?.find((item) => item.company === 'Decathlon');
  assert.ok(source, 'missing Decathlon HotJob source');
  assert.equal(source.graduationYear, '2027');
  assert.equal(source.trustCohort2027, true);
  assert.match(source.url, /hotjob\.cn|wecruit/);
});

test('official company pool includes high-fit verified 2027 Beisen sources', () => {
  const beisenCompanies = officialSources.beisen.map((item) => item.company);
  for (const company of ['传音控股','新华三集团','Babycare','慧策集团','锐明技术','扬腾创新','国贸股份']) {
    assert.ok(beisenCompanies.includes(company), `missing official Beisen source: ${company}`);
  }
  assert.ok(officialSources.beisen.length >= 14);
});

test('broad discovery covers adjacent business roles without blanket engineer penalty', () => {
  for (const role of ['国际商务','海外业务','贸易运营','客户成功','国际物流','供应链','管理培训生','战略运营','经营分析','品牌传播','雇主品牌','本地化']) {
    assert.ok(searchProfile.roleKeywords.includes(role), `missing discovery role: ${role}`);
  }
  assert.equal(searchProfile.strongExclude.includes('工程师'), false);
  assert.ok(searchProfile.maxPages >= 1500);
  assert.ok(searchProfile.maxCandidates >= 10000);
});

test('ranking profile recognizes adjacent non-technical career families', () => {
  for (const role of ['国际商务','客户成功','国际物流','供应链管理','管理培训生','战略运营','品牌传播','雇主品牌','人力资源','本地化']) {
    assert.ok(defaultProfile.targetRoles.includes(role), `missing target role: ${role}`);
  }
});
