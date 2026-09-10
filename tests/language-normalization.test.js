import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLanguageRequirements, normalizeJobLanguages } from '../scripts/job-discovery/languages.mjs';

test('title-level Korean is written into languages and marked mandatory', () => {
  const result = normalizeJobLanguages({ title: '全球市场营销专员（韩语）', languages: [] });
  assert.deepEqual(result.languages, ['韩语']);
  assert.deepEqual(result.mandatoryLanguages, ['韩语']);
});

test('title-level Thai overrides stale English-only structure with textual evidence', () => {
  const result = normalizeJobLanguages({ title: '电商运营专员-泰语', languages: ['英语'] });
  assert.deepEqual(result.languages, ['泰语']);
  assert.deepEqual(result.mandatoryLanguages, ['泰语']);
});

test('English Swedish title is canonicalized and the minor language is mandatory', () => {
  const result = normalizeJobLanguages({ title: 'GTM Product Manager (Swedish)', languages: [] });
  assert.deepEqual(result.languages, ['瑞典语']);
  assert.deepEqual(result.mandatoryLanguages, ['瑞典语']);
});

test('preferred language in title is not treated as a mandatory gate', () => {
  const result = normalizeJobLanguages({ title: '海外运营（德语优先）', languages: [] });
  assert.deepEqual(result.languages, ['德语']);
  assert.deepEqual(result.mandatoryLanguages, []);
  assert.deepEqual(result.preferredLanguages, ['德语']);
});

test('English-or-Japanese alternative is not converted into a mandatory minor language', () => {
  const result = analyzeLanguageRequirements({
    title: '国际业务运营',
    jobRequirements: '英语或日语其中一种可作为工作语言。'
  });
  assert.deepEqual(result.languages, ['英语', '日语']);
  assert.deepEqual(result.mandatoryLanguages, []);
});

test('mandatory language requirement in JD is structured even when title omits it', () => {
  const result = normalizeJobLanguages({
    title: '海外内容运营',
    jobRequirements: '要求阿拉伯语听说读写流利，可作为工作语言。'
  });
  assert.deepEqual(result.languages, ['阿拉伯语']);
  assert.deepEqual(result.mandatoryLanguages, ['阿拉伯语']);
});

test('existing structured language is retained only when no textual language evidence exists', () => {
  const result = normalizeJobLanguages({ title: '海外市场专员', languages: ['Korean'] });
  assert.deepEqual(result.languages, ['韩语']);
});
