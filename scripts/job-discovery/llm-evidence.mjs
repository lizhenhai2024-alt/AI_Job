/**
 * JD 事实抽取 —— LLM 抽取器（OpenAI 兼容 Chat Completions）。
 *
 * 契约 docs/job-intelligence-contract-v1.md §4：上游只定义事实，评价在下游算。
 * 本模块产出与 policy.mjs 的 extractJdEvidence 完全同形，下游 campus-job-board 无感。
 *
 * 三条设计约束：
 *   1. 只能引用，不能断言 —— 专业/资格类字段必须是 JD 原文子串；职责类别受闭集约束。
 *   2. Provider 只影响“从哪里抽”，不改变事实结构与校验标准。
 *   3. 失败即降级 —— 单 Provider 失败返回 null，由调用方切下一个，最终回退正则。
 */

import crypto from 'node:crypto';
import { TECH_DUTY_LABELS, BUSINESS_DUTY_LABELS } from './policy.mjs';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-flash';
export const MAX_JD_CHARS = 6000;

// GitHub Actions / headless 默认不再走 Zen free：2026-09 实测 mimo-v2.5-free
// 通过通用 API 会返回 MissingSessionID / “free tier can only be used in OpenCode”。
// 保留 zen-free 预设，供未来官方开放 headless free-tier 或显式调试时使用。
// Gemini 使用同一个 GEMINI_API_KEY 串 3 个免费层稳定模型，遇到 503/限流自动切换。
export const DEFAULT_PROVIDER_ORDER = ['gemini-free', 'gemini-free-31', 'gemini-free-25', 'deepseek'];

/**
 * 兼容旧调用方：MODEL_PRESETS 仍保留“单 Provider 时代”的 DeepSeek 预设集合。
 */
export const MODEL_PRESETS = {
  deepseek: {
    provider: 'deepseek',
    costClass: 'paid',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    responseFormat: 'json_object',
    timeoutMs: 20000,
    extraBody: { reasoning_effort: 'none' }
  }
};

/**
 * 多 Provider 预设：
 * - Zen free：保留但不进默认 headless 顺序；当前 free tier 需要 OpenCode session。
 * - Gemini：官方 OpenAI compatibility；3.5/3.1/2.5 Flash-Lite 都有 Free Tier，
 *   用同一 GEMINI_API_KEY 逐级兜底，优先高吞吐的 Flash-Lite。
 * - DeepSeek：付费兜底，保持 reasoning_effort:none 控成本。
 */
export const PROVIDER_PRESETS = {
  'zen-free': {
    provider: 'opencode-zen',
    costClass: 'free-model-opencode-session',
    baseUrl: 'https://opencode.ai/zen/v1',
    model: 'mimo-v2.5-free',
    responseFormat: 'none',
    timeoutMs: 12000,
    extraBody: {}
  },
  'gemini-free': {
    provider: 'google-gemini',
    costClass: 'free-tier',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
    responseFormat: 'json_schema',
    timeoutMs: 15000,
    extraBody: {}
  },
  'gemini-free-31': {
    provider: 'google-gemini',
    costClass: 'free-tier',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.1-flash-lite',
    responseFormat: 'json_schema',
    timeoutMs: 15000,
    extraBody: {}
  },
  'gemini-free-25': {
    provider: 'google-gemini',
    costClass: 'free-tier',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash-lite',
    responseFormat: 'json_schema',
    timeoutMs: 15000,
    extraBody: {}
  },
  ...MODEL_PRESETS
};

export const PROVIDER_SECRET_ENV = {
  'zen-free': 'OPENCODE_ZEN_API_KEY',
  'gemini-free': 'GEMINI_API_KEY',
  'gemini-free-31': 'GEMINI_API_KEY',
  'gemini-free-25': 'GEMINI_API_KEY',
  deepseek: 'JD_EVIDENCE_API_KEY'
};

export const DEFAULT_RESPONSE_FORMAT = 'json_object';

export function resolvePreset(options = {}) {
  const preset = options.preset ? PROVIDER_PRESETS[options.preset] : null;
  if (options.preset && !preset) throw new Error(`未知预设：${options.preset}`);
  return {
    preset: options.preset || 'deepseek',
    provider: options.provider || preset?.provider || 'deepseek',
    costClass: options.costClass || preset?.costClass || 'paid',
    baseUrl: options.baseUrl || preset?.baseUrl || DEFAULT_BASE_URL,
    model: options.model || preset?.model || DEFAULT_MODEL,
    responseFormat: options.responseFormat || preset?.responseFormat || DEFAULT_RESPONSE_FORMAT,
    timeoutMs: Number(options.timeoutMs || preset?.timeoutMs || 60000),
    extraBody: { ...(preset?.extraBody || {}), ...(options.extraBody || {}) }
  };
}

/** Provider 顺序只决定先尝试谁，不改变事实契约。 */
export function resolveProviderOrder(env = process.env) {
  const raw = String(env.JD_EVIDENCE_PROVIDER_ORDER || '').trim();
  const requested = raw
    ? raw.split(',').map((x) => x.trim()).filter(Boolean)
    : (env.JD_EVIDENCE_PRESET ? [String(env.JD_EVIDENCE_PRESET).trim()] : DEFAULT_PROVIDER_ORDER);
  const seen = new Set();
  const order = [];
  for (const name of requested) {
    if (!PROVIDER_PRESETS[name] || seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  return order.length ? order : [...DEFAULT_PROVIDER_ORDER];
}

export function apiKeyForPreset(preset, env = process.env) {
  if (preset === 'deepseek') return env.JD_EVIDENCE_API_KEY || env.DEEPSEEK_API_KEY || '';
  const name = PROVIDER_SECRET_ENV[preset];
  return name ? (env[name] || '') : '';
}

export function resolveProviderChain(env = process.env, { includeUnconfigured = false } = {}) {
  return resolveProviderOrder(env)
    .map((preset) => ({ preset, apiKey: apiKeyForPreset(preset, env), ...resolvePreset({ preset }) }))
    .filter((item) => includeUnconfigured || Boolean(item.apiKey));
}

const EVIDENCE_KEYS = ['majorClauses', 'eligibilityClauses', 'technicalDuties', 'businessDuties'];

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

export function jobTextOf(job = {}) {
  return [job.title, job.jobDescription, job.jobRequirements]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_JD_CHARS);
}

const squash = (s) => String(s || '').replace(/\s+/g, '');

export const MIN_JD_BODY_CHARS = 80;

export function hasJdBody(job = {}, min = MIN_JD_BODY_CHARS) {
  return squash([job.jobDescription, job.jobRequirements].filter(Boolean).join('')).length >= min;
}

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
  const inClosedSet = (value, allowed) => {
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = String(item || '').trim();
      if (!text || !allowed.includes(text)) continue;
      out.push(text);
    }
    return { values: [...new Set(out)] };
  };

  const major = quoted(raw.majorClauses, 'majorClauses');
  if (major.error) return null;
  const eligibility = quoted(raw.eligibilityClauses, 'eligibilityClauses');
  if (eligibility.error) return null;
  const technical = inClosedSet(raw.technicalDuties, TECH_DUTY_LABELS);
  const business = inClosedSet(raw.businessDuties, BUSINESS_DUTY_LABELS);

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
  return `${job.id || '(no-id)'}:${digest}:${model}`;
}

function responseFormatBody(mode) {
  if (!mode || mode === 'none') return null;
  if (mode === 'json_object') return { type: 'json_object' };
  return { type: 'json_schema', json_schema: buildSchema() };
}

async function callCompatible(job, options) {
  const {
    apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL,
    responseFormat = DEFAULT_RESPONSE_FORMAT,
    extraBody = {},
    fetchImpl = globalThis.fetch, timeoutMs = 60000
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const format = responseFormatBody(responseFormat);
    const body = {
      model,
      temperature: 0,
      ...extraBody,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: jobTextOf(job) }
      ]
    };
    if (format) body.response_format = format;

    const res = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch {}
      return { error: `HTTP ${res.status}${detail ? ` ${detail}` : ''}`, status: res.status, detail };
    }
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

function looksLikeResponseFormatRejection(result) {
  return result?.status === 400 && /response_format|json_schema|unavailable|structured output/i.test(result?.detail || '');
}

export async function extractWithLlm(job = {}, options = {}) {
  const { apiKey, cache, onError, retries = 1 } = options;
  if (!apiKey) return null;

  const { baseUrl, model, responseFormat, timeoutMs, extraBody } = resolvePreset(options);
  const key = cacheKey(job, model);
  const cached = cache?.get?.(key);
  if (cached) return cached;

  const jdText = jobTextOf(job);
  if (!hasJdBody(job)) return null;

  const formats = responseFormat === 'none'
    ? ['none']
    : (responseFormat === 'json_object' ? ['json_object'] : ['json_schema', 'json_object']);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    for (let i = 0; i < formats.length; i += 1) {
      const result = await callCompatible(job, {
        ...options, baseUrl, model, timeoutMs, extraBody, responseFormat: formats[i]
      });
      if (result.raw) {
        const evidence = validateEvidence(result.raw, jdText);
        if (evidence) {
          cache?.set?.(key, evidence);
          return evidence;
        }
        onError?.(`校验未通过（第 ${attempt + 1} 次）`);
        break;
      }
      if (looksLikeResponseFormatRejection(result) && i < formats.length - 1) {
        onError?.(`${formats[i]} 不被支持，回退 ${formats[i + 1]}`);
        continue;
      }
      onError?.(`${result.error}（第 ${attempt + 1} 次）`);
      break;
    }
  }
  return null;
}

export function createFileCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) || null,
    set: (key, value) => { map.set(key, value); },
    toJSON: () => Object.fromEntries(map)
  };
}
