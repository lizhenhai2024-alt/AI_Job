import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJdEvidence, resolveJdEvidence, isLlmEvidence } from '../scripts/job-discovery/policy.mjs';

// 契约 docs/job-intelligence-contract-v1.md §4：上游只定义事实，评价在下游算。
// 这个文件钉住的是：jdEvidence 只能带事实，不能把判定夹带回来。

const FULL_TEXT_JOB = {
  id: 'demo-full',
  company: '示例公司',
  title: '海外市场专员',
  city: '深圳',
  graduationYear: '2027',
  deadline: '2027-03-31',
  _searchText: [
    '岗位职责：负责海外市场推广与客户沟通，跟进国际业务落地。',
    '任职资格：本科及以上学历，英语或国际贸易专业优先。'
  ].join('\n')
};

// 快照保留捞回来的历史岗位：没有 _searchText，只有落库的 JD 字段
const RETAINED_JOB = {
  id: 'demo-retained',
  company: '示例公司',
  title: '海外市场专员',
  city: '深圳',
  graduationYear: '2027',
  jobDescription: '岗位职责：负责海外市场推广与客户沟通，跟进国际业务落地。',
  jobRequirements: '任职资格：本科及以上学历，英语或国际贸易专业优先。'
};

test('jdEvidence exposes exactly the factual fields', () => {
  const ev = extractJdEvidence(FULL_TEXT_JOB);
  assert.deepEqual(
    Object.keys(ev).sort(),
    ['businessDuties', 'eligibilityClauses', 'majorClauses', 'source', 'technicalDuties']
  );
  assert.equal(ev.source, 'regex-v1');
});

test('jdEvidence carries no candidate-fit verdicts', () => {
  for (const job of [FULL_TEXT_JOB, RETAINED_JOB]) {
    const flat = JSON.stringify(extractJdEvidence(job));
    for (const banned of ['verdict', 'penalty', 'bonus', 'decisionSteps', 'warnings', 'strengths', 'hardRequirements', '"label"']) {
      assert.ok(!flat.includes(banned), `${banned} 不应出现在 jdEvidence 中：${flat}`);
    }
  }
});

test('jdEvidence extracts major clauses as JD quotes', () => {
  const ev = extractJdEvidence(FULL_TEXT_JOB);
  assert.ok(ev.majorClauses.length > 0, '应识别到专业相关原文');
  assert.match(ev.majorClauses.join(' '), /本科|英语|国际贸易/);
});

test('jdEvidence extracts eligibility and duty facts', () => {
  const ev = extractJdEvidence(FULL_TEXT_JOB);
  assert.ok(ev.eligibilityClauses.some((c) => c.includes('2027')), '应有届别证据');
  assert.ok(ev.eligibilityClauses.some((c) => c.includes('2027-03-31')), '应有截止日期证据');
  assert.ok(ev.businessDuties.includes('国际业务'), '应识别到国际业务职责');
});

test('jdEvidence falls back to stored JD fields when _searchText is gone', () => {
  const ev = extractJdEvidence(RETAINED_JOB);
  assert.ok(ev.majorClauses.length > 0, '快照保留的岗位也要能抽到专业原文');
  assert.match(ev.majorClauses.join(' '), /本科|英语|国际贸易/);
  assert.ok(ev.businessDuties.length > 0, '快照保留的岗位也要能抽到职责');
});

// ---- resolveJdEvidence：决定重算 / 保留 / 迁移 ----

test('fresh scrape recomputes from the authoritative full text', () => {
  const ev = resolveJdEvidence(FULL_TEXT_JOB);
  assert.equal(ev.source, 'regex-v1');
});

test('already-extracted evidence is preserved, never recomputed from残缺文本', () => {
  const stored = { source: 'regex-v1', majorClauses: ['原文A'], eligibilityClauses: [], businessDuties: [], technicalDuties: [] };
  const ev = resolveJdEvidence({ ...RETAINED_JOB, jdEvidence: stored });
  assert.equal(ev, stored, '没有全文时重算只会更差，必须原样保留');
});

test('legacy candidateFit is migrated verbatim when no full text survives', () => {
  const legacy = {
    ...RETAINED_JOB,
    candidateFit: {
      major: { verdict: '兼容', label: '文科/社科专业范围兼容', evidence: ['本科及以上学历，英语或国际贸易专业优先'] },
      eligibilityEvidence: ['招聘对象：2027届'],
      responsibility: { verdict: '待核', business: ['国际业务'], technical: [] },
      warnings: ['适配风险X'], penalty: 12, bonus: 0, decisionSteps: [{ step: 1 }]
    }
  };
  const ev = resolveJdEvidence(legacy);
  assert.equal(ev.source, 'legacy-candidateFit');
  assert.deepEqual(ev.majorClauses, ['本科及以上学历，英语或国际贸易专业优先']);
  assert.deepEqual(ev.businessDuties, ['国际业务']);
  // 判定字段一个都不能跟着迁移过来
  const flat = JSON.stringify(ev);
  for (const banned of ['verdict', 'penalty', 'bonus', 'decisionSteps', 'warnings', 'label']) {
    assert.ok(!flat.includes(banned), `${banned} 不应被迁移进 jdEvidence：${flat}`);
  }
});

// 富化阶段产出的证据必须活过下一轮刷新，否则每次都被正则覆盖回去，等于白花钱。
test('LLM evidence survives the next refresh cycle', () => {
  const llm = {
    source: 'llm:deepseek-flash',
    majorClauses: ['本科及以上学历，英语或国际贸易专业优先'],
    eligibilityClauses: ['招聘对象：2027届'],
    businessDuties: ['国际业务'],
    technicalDuties: []
  };
  // 关键：即使 _searchText 还在（新鲜抓取），也不能被正则重算覆盖
  const ev = resolveJdEvidence({ ...FULL_TEXT_JOB, jdEvidence: llm });
  assert.equal(ev, llm);
});

test('isLlmEvidence recognises every llm source form only', () => {
  assert.equal(isLlmEvidence({ source: 'llm' }), true);
  assert.equal(isLlmEvidence({ source: 'llm:deepseek-flash' }), true);
  assert.equal(isLlmEvidence({ source: 'llm:deepseek-v4-flash-free' }), true);
  assert.equal(isLlmEvidence({ source: 'regex-v1' }), false);
  assert.equal(isLlmEvidence({ source: 'legacy-candidateFit' }), false);
  assert.equal(isLlmEvidence(undefined), false);
  assert.equal(isLlmEvidence(null), false);
  assert.equal(isLlmEvidence({}), false);
});

test('empty legacy evidence does not block a fresh extraction attempt', () => {
  const ev = resolveJdEvidence({ ...RETAINED_JOB, candidateFit: { major: { evidence: [] }, eligibilityEvidence: [], responsibility: {} } });
  assert.equal(ev.source, 'regex-v1');
  assert.ok(ev.majorClauses.length > 0);
});
