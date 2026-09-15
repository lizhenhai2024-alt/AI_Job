/**
 * JD 事实抽取 —— LLM 抽取器（OpenCode Zen，OpenAI 兼容 Chat Completions）。
 *
 * 契约 docs/job-intelligence-contract-v1.md §4：上游只定义事实，评价在下游算。
 * 本模块产出与 policy.mjs 的 extractJdEvidence 完全同形，下游 campus-job-board 无感。
 *
 * 三条设计约束（都写进了 validateEvidence）：
 *   1. 只能引用，不能断言 —— 专业/资格类字段必须是 JD 原文子串，不是原文的直接丢弃。
 *   2. 职责类别受闭集约束 —— 与 TECH_DUTY_LABELS / BUSINESS_DUTY_LABELS 同源，
 *      不引入第二份词表。
 *   3. 失败即降级 —— 任何异常都返回 null，由调用方回退到正则抽取，绝不让刷新管线挂掉。
 *
 * 端点事实（2026-09 检索所得，接入前请照官方文档核对）：
 *   base https://opencode.ai/zen/v1   model mimo-v2.5-free
 *   auth Bearer（OPENCODE_ZEN_API_KEY）  上下文 200K / 输出上限 32K
 *   免费层是 best-effort：促销可能到期、model ID 可能变、有速率限制。
 */

import crypto from 'node:crypto';
import { TECH_DUTY_LABELS, BUSINESS_DUTY_LABELS } from './policy.mjs';

export const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';
export const DEFAULT_MODEL = 'mimo-v2.5-free';
export const MAX_JD_CHARS = 6000;

/**
 * 预设。本模块与供给方无关：baseUrl / model / apiKey 全部是调用参数，
 * 因此 OpenCode Zen 的 MiMo、Zen 上的 DeepSeek、或 DeepSeek 直连都能用同一套代码。
 *
 * 不会读取也不会修改 ~/.config/opencode/opencode.json —— 现有 DeepSeek 配置原样保留，
 * 这里只是把凭据显式传进来。
 *
 * 换模型：extractWithLlm(job, { preset: 'deepseek-flash', apiKey })。
 */
export const MODEL_PRESETS = {
  'mimo-2.5': { baseUrl: DEFAULT_BASE_URL, model: 'mimo-v2.5-free' },
  'deepseek-flash': { baseUrl: DEFAULT_BASE_URL, model: 'deepseek-v4-flash-free' }
};

export function resolvePreset(options = {}) {
  const preset = options.preset ? MODEL_PRESETS[options.preset] : null;
  if (options.preset && !preset) throw new Error(`未知预设：${options.preset}`);
  return {
    baseUrl: options.baseUrl || preset?.baseUrl || DEFAULT_BASE_URL,
    model: options.model || preset?.model || DEFAULT_MODEL
  };
}

const EVIDENCE_KEYS = ['majorClauses', 'eligibilityClauses', 'technicalDuties', 'businessDuties'];

/** 抽取指令。保持稳定（无时间戳/无每请求变量），便于端点侧前缀缓存命中。 */
export const SYSTEM_PROMPT = `你是校招岗位 JD 的事实抽取器。只抽取 JD 里**明确写了**的内容，不做任何适配判断。

规则：
1. majorClauses：JD 中关于专业/学历要求的原文片段，逐字摘录，不要改写、不要概括。
2. eligibilityClauses：JD 中关于招聘对象、届别、毕业时间窗口、投递截止的原文片段，逐字摘录。
3. technicalDuties / businessDuties：从给定闭集中选出 JD 职责部分**确实出现**的类别。闭集之外的类别一律不许输出。
4. 没有证据就返回空数组。不要推测，不要补全，不要因为"通常如此"就写入。
5. 不要判断这个岗位适不适合任何人 —— 那是下游的事。

只返回 JSON。`;

function buildSchema() {
  return {
    name: 'jd_evidence',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: EVIDENCE_KEYS,
      properties: {
        majorClauses: { type: 'array', items: { type: 'string' } },
        eligibilityClauses: { type: 'array', items: { type: 'string' } },
        technicalDuties: { type: 'array', items: { type: 'string', enum: TECH_DUTY_LABELS } },
        businessDuties: { type: 'array', items: { type: 'string', enum: BUSINESS_DUTY_LABELS } }
      }
    }
  };
}

/**
 * 送进模型、也用于引用校验的文本。
 *
 * 刻意**不含** job.description：在这个仓库里它始终是适配器生成的摘要
 * （「XX官方2027校园招聘岗位；识别关键词：Excel、数据分析」），不是 JD 原文。
 * 把它放进 prompt 会让 validateEvidence 的"必须是原文子串"形同虚设 ——
 * 模型可以合法地"引用"摘要里的话，而那不是岗位事实。
 */
export function jobTextOf(job = {}) {
  return [job.title, job.jobDescription, job.jobRequirements]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_JD_CHARS);
}

const squash = (s) => String(s || '').replace(/\s+/g, '');

/** JD 正文字数下限。低于此值的记录只有适配器摘要可读，抽取没有意义。 */
export const MIN_JD_BODY_CHARS = 80;

export function hasJdBody(job = {}, min = MIN_JD_BODY_CHARS) {
  return squash([job.jobDescription, job.jobRequirements].filter(Boolean).join('')).length >= min;
}

/**
 * 校验并规整模型输出。返回 null 表示这份输出不可用（调用方应降级）。
 * 关键：专业/资格类必须是 JD 原文子串；职责类必须落在闭集内。
 */
export function validateEvidence(raw, jdText) {
  if (!raw || typeof raw !== 'object') return null;
  const haystack = squash(jdText);
  const quoted = (value, field) => {
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = String(item || '').trim();
      if (!text) continue;
      if (!haystack.includes(squash(text))) return { error: `${field} 含非原文内容：${text.slice(0, 40)}` };
      out.push(text);
    }
    return { values: [...new Set(out)] };
  };
  const inClosedSet = (value, allowed, field) => {
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = String(item || '').trim();
      if (!text) continue;
      if (!allowed.includes(text)) return { error: `${field} 含闭集外标签：${text}` };
      out.push(text);
    }
    return { values: [...new Set(out)] };
  };

  const major = quoted(raw.majorClauses, 'majorClauses');
  if (major.error) return null;
  const eligibility = quoted(raw.eligibilityClauses, 'eligibilityClauses');
  if (eligibility.error) return null;
  const technical = inClosedSet(raw.technicalDuties, TECH_DUTY_LABELS, 'technicalDuties');
  if (technical.error) return null;
  const business = inClosedSet(raw.businessDuties, BUSINESS_DUTY_LABELS, 'businessDuties');
  if (business.error) return null;

  return {
    source: 'llm',
    majorClauses: major.values,
    eligibilityClauses: eligibility.values,
    technicalDuties: technical.values,
    businessDuties: business.values
  };
}

export function cacheKey(job = {}, model = '') {
  const digest = crypto.createHash('sha256').update(jobTextOf(job)).digest('hex').slice(0, 16);
  // 带模型：换抽取模型后必须重抽，否则会复用另一个模型产出的证据。
  return `${job.id || '(no-id)'}:${digest}:${model}`;
}

async function callZen(job, options) {
  const {
    apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL,
    fetchImpl = globalThis.fetch, timeoutMs = 60000
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: buildSchema() },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: jobTextOf(job) }
        ]
      })
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return { error: '响应缺少 choices[0].message.content' };
    return { raw: JSON.parse(content) };
  } catch (error) {
    return { error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抽取一条岗位的 JD 事实。
 * 成功返回 { source:'llm', ... }；任何失败返回 null（调用方回退正则）。
 * 不抛异常。
 */
export async function extractWithLlm(job = {}, options = {}) {
  const { apiKey, cache, onError, retries = 1 } = options;
  if (!apiKey) return null;

  const { baseUrl, model } = resolvePreset(options);
  const key = cacheKey(job, model);
  const cached = cache?.get?.(key);
  if (cached) return cached;

  const jdText = jobTextOf(job);
  if (!hasJdBody(job)) return null; // 只有适配器摘要，抽取没有意义

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await callZen(job, { ...options, baseUrl, model });
    if (result.raw) {
      const evidence = validateEvidence(result.raw, jdText);
      if (evidence) {
        cache?.set?.(key, evidence);
        return evidence;
      }
      onError?.(`校验未通过（第 ${attempt + 1} 次）`);
    } else {
      onError?.(`${result.error}（第 ${attempt + 1} 次）`);
    }
  }
  return null;
}

/** 简易 JSON 文件缓存。调用方负责持久化，便于跨次刷新复用、避免重复计费。 */
export function createFileCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) || null,
    set: (key, value) => { map.set(key, value); },
    toJSON: () => Object.fromEntries(map)
  };
}
