import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWithLlm, validateEvidence, jobTextOf, cacheKey, createFileCache,
  resolvePreset, MODEL_PRESETS, hasJdBody, MIN_JD_BODY_CHARS,
  DEFAULT_BASE_URL, DEFAULT_MODEL
} from '../scripts/job-discovery/llm-evidence.mjs';
import { TECH_DUTY_LABELS, BUSINESS_DUTY_LABELS } from '../scripts/job-discovery/policy.mjs';

// 全程用 mock fetch，不打网络。
// 真实长度的 JD —— hasJdBody 的 80 字门槛是按线上分布定的（1443 条里 1225 条过线）。
const JD = [
  '岗位职责：',
  '1、负责海外市场推广与品牌传播，跟进国际业务落地；',
  '2、维护客户关系，负责客户沟通与商务对接；',
  '3、整理海外市场资料，输出阶段性分析报告。',
  '任职资格：',
  '1、本科及以上学历，英语或国际贸易专业优先；',
  '2、具备良好的跨文化沟通能力，能适应短期海外出差；',
  '3、熟练使用 Excel 进行数据分析。',
  '招聘对象：2027届。'
].join('\n');

const JOB = { id: 'demo-llm', company: '示例', title: '海外市场专员', jobDescription: JD, jobRequirements: '' };

function mockFetch(payload, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    };
  };
  impl.calls = calls;
  return impl;
}

function okPayload(content) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

test('extracts verbatim JD quotes through the OpenAI-compatible endpoint', async () => {
  const fetchImpl = mockFetch(okPayload({
    majorClauses: ['本科及以上学历，英语或国际贸易专业优先'],
    eligibilityClauses: ['招聘对象：2027届'],
    technicalDuties: [],
    businessDuties: ['国际业务', '客户关系']
  }));
  const ev = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, retries: 0 });

  assert.equal(ev.source, 'llm');
  assert.deepEqual(ev.majorClauses, ['本科及以上学历，英语或国际贸易专业优先']);
  assert.deepEqual(ev.businessDuties, ['国际业务', '客户关系']);

  const [call] = fetchImpl.calls;
  assert.equal(call.url, `${DEFAULT_BASE_URL}/chat/completions`);
  assert.equal(call.body.model, DEFAULT_MODEL);
  assert.equal(call.body.response_format.type, 'json_schema');
});

test('rejects clauses that are not verbatim JD text', async () => {
  const fetchImpl = mockFetch(okPayload({
    majorClauses: ['本岗位适合英语专业候选人'],   // 断言，不是原文
    eligibilityClauses: [], technicalDuties: [], businessDuties: []
  }));
  const ev = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, retries: 0 });
  assert.equal(ev, null, '非原文的专业结论必须被丢弃');
});

// 职责标签是软过滤：越界丢弃，但不能连累同一份输出里合法的原文引用。
// 实测 DeepSeek 会把 JD 原文的职责短语当标签返回，硬校验会让成功率掉到 5/8。
test('duty labels outside the closed set are dropped, not fatal', async () => {
  const fetchImpl = mockFetch(okPayload({
    majorClauses: ['本科及以上学历，英语或国际贸易专业优先'],
    eligibilityClauses: ['招聘对象：2027届'],
    technicalDuties: [],
    businessDuties: ['海外市场拓展', '国际业务']   // 前者闭集外，后者闭集内
  }));
  const ev = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, retries: 0 });
  assert.ok(ev, '越界标签不该作废整份输出');
  assert.deepEqual(ev.businessDuties, ['国际业务'], '只保留闭集内的');
  assert.deepEqual(ev.majorClauses, ['本科及以上学历，英语或国际贸易专业优先'], '原文引用必须保住');
});

test('a paraphrased (non-verbatim) clause is still fatal', () => {
  const ev = validateEvidence(
    { majorClauses: ['本岗位欢迎英语专业同学'], eligibilityClauses: [], technicalDuties: [], businessDuties: ['国际业务'] },
    JD
  );
  assert.equal(ev, null, '改写专业要求是断言而非引用，必须整份作废');
});

test('transport and protocol failures degrade to null instead of throwing', async () => {
  assert.equal(await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: mockFetch({}, { status: 429 }), retries: 0 }), null);
  assert.equal(await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: mockFetch({}), retries: 0 }), null);

  const boom = async () => { throw new Error('network down'); };
  assert.equal(await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: boom, retries: 0 }), null);

  const badJson = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) });
  assert.equal(await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: badJson, retries: 0 }), null);
});

test('no api key means no request at all', async () => {
  const fetchImpl = mockFetch(okPayload({}));
  assert.equal(await extractWithLlm(JOB, { fetchImpl }), null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('thin text is skipped rather than sent to the model', async () => {
  const fetchImpl = mockFetch(okPayload({}));
  const ev = await extractWithLlm({ id: 'x', title: '' }, { apiKey: 'k', fetchImpl, retries: 0 });
  assert.equal(ev, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test('a cached result short-circuits the call', async () => {
  const fetchImpl = mockFetch(okPayload({
    majorClauses: ['本科及以上学历，英语或国际贸易专业优先'],
    eligibilityClauses: [], technicalDuties: [], businessDuties: []
  }));
  const cache = createFileCache();
  const first = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, cache, retries: 0 });
  const second = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, cache, retries: 0 });
  assert.deepEqual(second, first);
  assert.equal(fetchImpl.calls.length, 1, '第二次必须命中缓存，不再计费');
});

test('cache key changes when the JD text changes', () => {
  const a = cacheKey({ id: 'j1', jobDescription: JD });
  const b = cacheKey({ id: 'j1', jobDescription: `${JD} 补充一句。` });
  assert.notEqual(a, b);
  assert.equal(cacheKey({ id: 'j1', jobDescription: JD }), a, '同样输入必须稳定');
});

test('validator output shape matches the regex extractor exactly', () => {
  const ev = validateEvidence(
    { majorClauses: ['本科及以上学历，英语或国际贸易专业优先'], eligibilityClauses: ['招聘对象：2027届'], technicalDuties: [], businessDuties: ['国际业务'] },
    JD
  );
  assert.deepEqual(
    Object.keys(ev).sort(),
    ['businessDuties', 'eligibilityClauses', 'majorClauses', 'source', 'technicalDuties']
  );
});

// 供给方无关：DeepSeek 配置必须原样可用，换模型只改一个参数。
test('presets let the same code run MiMo or DeepSeek without touching opencode.json', () => {
  assert.equal(resolvePreset({}).model, DEFAULT_MODEL);
  assert.equal(resolvePreset({ preset: 'deepseek' }).model, 'deepseek-flash');
  assert.equal(resolvePreset({ preset: 'deepseek' }).baseUrl, 'https://api.deepseek.com');
  assert.equal(resolvePreset({ preset: 'mimo-2.5' }).model, 'mimo-v2.5-free');
  // 显式参数优先级最高
  assert.equal(resolvePreset({ preset: 'mimo-2.5', model: 'custom' }).model, 'custom');
  assert.throws(() => resolvePreset({ preset: 'nope' }), /未知预设/);
  assert.deepEqual(Object.keys(MODEL_PRESETS).sort(), ['deepseek', 'mimo-2.5']);
});

test('switching preset actually changes the model sent on the wire', async () => {
  const fetchImpl = mockFetch(okPayload({
    majorClauses: [], eligibilityClauses: [], technicalDuties: [], businessDuties: []
  }));
  await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, preset: 'deepseek', retries: 0 });
  assert.equal(fetchImpl.calls[0].body.model, 'deepseek-flash');
});

test('cache does not leak evidence across models', () => {
  assert.notEqual(cacheKey(JOB, 'mimo-v2.5-free'), cacheKey(JOB, 'deepseek-flash'));
});

// DeepSeek 只支持 json_object，且要求 prompt 里出现 "json" 字样。
test('response_format is taken from the preset', async () => {
  const schema = mockFetch(okPayload({ majorClauses: [], eligibilityClauses: [], technicalDuties: [], businessDuties: [] }));
  await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: schema, preset: 'mimo-2.5', retries: 0 });
  assert.equal(schema.calls[0].body.response_format.type, 'json_schema');

  const object = mockFetch(okPayload({ majorClauses: [], eligibilityClauses: [], technicalDuties: [], businessDuties: [] }));
  await extractWithLlm(JOB, { apiKey: 'k', fetchImpl: object, preset: 'deepseek', retries: 0 });
  assert.deepEqual(object.calls[0].body.response_format, { type: 'json_object' });
});

test('an unsupported response_format falls back to json_object instead of losing the job', async () => {
  let call = 0;
  const fetchImpl = async (url, init) => {
    call += 1;
    const body = JSON.parse(init.body);
    if (body.response_format.type === 'json_schema') {
      return { ok: false, status: 400, text: async () => '{"error":{"message":"This response_format type is unavailable now"}}' };
    }
    return { ok: true, status: 200, json: async () => okPayload({
      majorClauses: ['本科及以上学历，英语或国际贸易专业优先'], eligibilityClauses: [], technicalDuties: [], businessDuties: []
    }) };
  };
  const ev = await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, retries: 0 });
  assert.ok(ev, '格式被拒后必须回退，而不是返回 null');
  assert.equal(ev.source, 'llm');
  assert.equal(call, 2, '恰好两次调用：一次 json_schema 被拒，一次 json_object 成功');
});

test('a non-format 400 does not trigger the fallback', async () => {
  const fetchImpl = mockFetch({}, { status: 400 });
  const seen = [];
  await extractWithLlm(JOB, { apiKey: 'k', fetchImpl, retries: 0, onError: (m) => seen.push(m) });
  assert.equal(fetchImpl.calls.length, 1, '与格式无关的 400 不该白试一次');
  assert.ok(!seen.some((m) => /回退/.test(m)));
});

// description 在本仓库始终是适配器生成的摘要。把它放进 prompt 会让
// "必须是原文子串"这条校验失效 —— 模型可以合法引用摘要里的话。
test('jobTextOf excludes the adapter-generated description', () => {
  const job = {
    title: '海外市场专员',
    description: '图拉斯官方校园招聘岗位；职类：海外电商运营类。识别关键词：Excel、数据分析。',
    jobDescription: JD,
    jobRequirements: ''
  };
  const text = jobTextOf(job);
  assert.ok(text.includes('海外市场推广'), 'JD 正文必须在');
  assert.ok(!text.includes('识别关键词'), '适配器摘要不得进入 prompt');
  assert.ok(!text.includes('图拉斯官方校园招聘岗位'), '适配器摘要不得进入 prompt');
});

test('a summary-quoting model output cannot pass the verbatim check', () => {
  const job = { title: 'x', description: '识别关键词：Excel、数据分析。', jobDescription: JD, jobRequirements: '' };
  const sentText = jobTextOf(job);
  const ev = validateEvidence({ majorClauses: ['识别关键词：Excel、数据分析'], eligibilityClauses: [], technicalDuties: [], businessDuties: [] }, sentText);
  assert.equal(ev, null, '摘要里的话不是岗位事实，必须判为无效');
});

test('hasJdBody gates on real JD body, not on the adapter summary', () => {
  // 高校渠道典型：只有标题 + 一句渠道样板
  const boilerplate = {
    title: '宣讲单位：长城电源技术有限公司 工商查询',
    description: '湖南大学就业信息网发现的招聘信息。该渠道用于岗位发现与交叉取证；正式投递前仍需回公司官方校招官网核验具体岗位、届别与要求。',
    jobDescription: '', jobRequirements: ''
  };
  assert.equal(hasJdBody(boilerplate), false, '只有择板摘要的不该被送去抽取');
  assert.equal(hasJdBody(JOB), true, '有正文的应该被抽取');
  assert.equal(hasJdBody({ jobDescription: '短' }), false);
  assert.equal(MIN_JD_BODY_CHARS, 80);
});

test('duty vocabularies come from policy.mjs, not a second copy', () => {
  assert.ok(TECH_DUTY_LABELS.length > 0 && BUSINESS_DUTY_LABELS.length > 0);
  assert.ok(TECH_DUTY_LABELS.includes('模型/算法'));
  assert.ok(BUSINESS_DUTY_LABELS.includes('翻译/本地化'));
  assert.equal(jobTextOf(JOB).includes('海外市场推广'), true);
});
