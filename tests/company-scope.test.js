import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultProfile } from '../src/data/profile.js';

const officialSources = JSON.parse(readFileSync(new URL('../config/official-sources.json', import.meta.url), 'utf8'));
const searchProfile = JSON.parse(readFileSync(new URL('../config/search-profile.json', import.meta.url), 'utf8'));

test('official company pool includes newly verified 2027 sources', () => {
  const mokaCompanies = officialSources.moka.map((item) => item.company);
  for (const company of ['SHEIN','中兴通讯','雀巢中国','毕马威中国','微步在线']) {
    assert.ok(mokaCompanies.includes(company), `missing official source: ${company}`);
  }
  assert.ok(officialSources.moka.length >= 12);
});

test('broad discovery covers adjacent business roles without blanket engineer penalty', () => {
  for (const role of ['国际商务','客户成功','国际物流','供应链','管理培训生','战略运营','经营分析','品牌传播','雇主品牌','本地化']) {
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
