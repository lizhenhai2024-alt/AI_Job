import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROVIDER_ORDER,
  MODEL_PRESETS,
  PROVIDER_PRESETS,
  apiKeyForPreset,
  extractWithLlm,
  resolvePreset,
  resolveProviderChain,
  resolveProviderOrder
} from '../scripts/job-discovery/llm-evidence.mjs';

const JD = [
  '岗位职责：负责海外市场推广、国际客户沟通与市场数据整理，输出分析报告。',
  '任职资格：本科及以上学历，英语或国际贸易专业优先，具备良好的跨文化沟通能力。',
  '招聘对象：2027届毕业生。'
].join('\n');
const JOB = { id: 'provider-demo', title: '海外市场专员', jobDescription: JD, jobRequirements: '' };
const OK = {
  majorClauses: ['本科及以上学历，英语或国际贸易专业优先'],
  eligibilityClauses: ['招聘对象：2027届毕业生'],
  technicalDuties: [],
  businessDuties: ['国际业务']
};

function openAiPayload(value = OK) {
  return { choices: [{ message: { content: JSON.stringify(value) } }] };
}

function captureFetch(payload = openAiPayload()) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  fn.calls = calls;
  return fn;
}

test('default provider order is free-first then paid fallback', () => {
  assert.deepEqual(DEFAULT_PROVIDER_ORDER, ['zen-free', 'gemini-free', 'deepseek']);
  assert.deepEqual(resolveProviderOrder({}), DEFAULT_PROVIDER_ORDER);
  // 保持旧 API：MODEL_PRESETS 仍只有旧 DeepSeek 预设；多 Provider 看 PROVIDER_PRESETS。
  assert.deepEqual(Object.keys(MODEL_PRESETS), ['deepseek']);
  assert.deepEqual(Object.keys(PROVIDER_PRESETS), ['zen-free', 'gemini-free', 'deepseek']);
});

test('provider order is configurable and deduplicated', () => {
  assert.deepEqual(
    resolveProviderOrder({ JD_EVIDENCE_PROVIDER_ORDER: 'gemini-free,zen-free,gemini-free,unknown,deepseek' }),
    ['gemini-free', 'zen-free', 'deepseek']
  );
  assert.deepEqual(resolveProviderOrder({ JD_EVIDENCE_PRESET: 'deepseek' }), ['deepseek']);
});

test('provider keys stay isolated and DeepSeek keeps the legacy alias', () => {
  const env = {
    OPENCODE_ZEN_API_KEY: 'zen-key',
    GEMINI_API_KEY: 'gem-key',
    JD_EVIDENCE_API_KEY: 'ds-key',
    DEEPSEEK_API_KEY: 'legacy-ds'
  };
  assert.equal(apiKeyForPreset('zen-free', env), 'zen-key');
  assert.equal(apiKeyForPreset('gemini-free', env), 'gem-key');
  assert.equal(apiKeyForPreset('deepseek', env), 'ds-key');
  assert.equal(apiKeyForPreset('deepseek', { DEEPSEEK_API_KEY: 'legacy-ds' }), 'legacy-ds');
});

test('active provider chain filters missing keys but preserves order', () => {
  const env = { GEMINI_API_KEY: 'g', JD_EVIDENCE_API_KEY: 'd' };
  const chain = resolveProviderChain(env);
  assert.deepEqual(chain.map((x) => x.preset), ['gemini-free', 'deepseek']);
  assert.deepEqual(chain.map((x) => x.costClass), ['free-tier', 'paid']);
});

test('Zen free preset uses official Zen chat endpoint and omits response_format', async () => {
  const p = resolvePreset({ preset: 'zen-free' });
  assert.equal(p.baseUrl, 'https://opencode.ai/zen/v1');
  assert.equal(p.model, 'mimo-v2.5-free');
  assert.equal(p.responseFormat, 'none');
  assert.equal(p.timeoutMs, 12000);

  const fetchImpl = captureFetch();
  const ev = await extractWithLlm(JOB, { preset: 'zen-free', apiKey: 'z', fetchImpl, retries: 0 });
  assert.ok(ev);
  assert.equal(fetchImpl.calls[0].url, 'https://opencode.ai/zen/v1/chat/completions');
  assert.equal(fetchImpl.calls[0].body.model, 'mimo-v2.5-free');
  assert.equal('response_format' in fetchImpl.calls[0].body, false);
});

test('Gemini preset uses OpenAI compatibility and structured JSON schema', async () => {
  const p = resolvePreset({ preset: 'gemini-free' });
  assert.equal(p.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(p.model, 'gemini-3.8-flash');
  assert.equal(p.responseFormat, 'json_schema');
  assert.equal(p.timeoutMs, 15000);

  const fetchImpl = captureFetch();
  const ev = await extractWithLlm(JOB, { preset: 'gemini-free', apiKey: 'g', fetchImpl, retries: 0 });
  assert.ok(ev);
  assert.equal(fetchImpl.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(fetchImpl.calls[0].body.model, 'gemini-3.8-flash');
  assert.equal(fetchImpl.calls[0].body.response_format.type, 'json_schema');
});

test('DeepSeek remains a bounded paid fallback preset', () => {
  const p = resolvePreset({ preset: 'deepseek' });
  assert.equal(p.costClass, 'paid');
  assert.equal(p.model, 'deepseek-flash');
  assert.equal(p.responseFormat, 'json_object');
  assert.equal(p.timeoutMs, 20000);
  assert.equal(p.extraBody.reasoning_effort, 'none');
});
