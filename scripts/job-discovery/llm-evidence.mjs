/**
 * JD 事实抽取 —— LLM 抽取器（OpenAI 兼容 Chat Completions）。
 *
 * 契约 docs/job-intelligence-contract-v1.md §4：上游只定义事实，评价在下游算。
 * 本模块产出与 policy.mjs 的 extractJdEvidence 完全同形，下游 campus-job-board 无感。
 *
 * 三条设计约束（都写进了 validateEvidence）：
 *   1. 只能引用，不能断言 —— 专业/资格类字段必须是 JD 原文子串，不是原文的丢弃整份输出；
 *      职责类别是软过滤，闭集外的丢弃但不连累其余字段。
 *   2. 职责类别受闭集约束 —— 与 TECH_DUTY_LABELS / BUSINESS_DUTY_LABELS 同源，
 *      不引入第二份词表。
 *   3. 失败即降级 —— 任何异常都返回 null，由调用方回退到正则抽取，绝不让刷新管线挂掉。
 *
 * 当前供给方：DeepSeek 直连（见 MODEL_PRESETS）。实测事实（2026-09）：
 *   /models 返回 deepseek-flash 与 deepseek-v4-pro；base https://api.deepseek.com
 *   auth Bearer（JD_EVIDENCE_API_KEY）  只支持 response_format=json_object
 *   默认关推理（reasoning_effort:'none'），否则输出 token 多 42 倍、慢 21 倍
 *
 * 已弃用：OpenCode Zen 免费层要求其客户端 session ID，外部调用一律 400
 *   「OpenCode's free tier can only be used in OpenCode」——实测确认不可用。
 */

import crypto from 'node:crypto';
import { TECH_DUTY_LABELS, BUSINESS_DUTY_LABELS } from './policy.mjs';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-flash';
export const MAX_JD_CHARS = 6000;

/**
 * 预设。本模块与供给方无关：baseUrl / model / apiKey / extraBody 全部是调用参数。
 *
 * 换模型：extractWithLlm(job, { preset: 'deepseek', apiKey })。
 *
 * responseFormat 必须按端点能力给：
 *   - json_schema：结构化输出（OpenAI 及兼容端）
 *   - json_object：只保证返回合法 JSON。DeepSeek 只支持这个，
 *     且要求 prompt 里出现 "json" 字样（SYSTEM_PROMPT 结尾的「只返回 JSON。」满足）。
 * 给错的后果是整批 400 —— 实测过。所以宁可显式声明，也不猜。
 *
 * extraBody 里的 reasoning_effort:'none' 是关键的成本开关，实测（deepseek-flash，
 * 同一批 10 条岗位、同样 10/10 通过率）：
 *   关推理  874ms/条  输出  89 token  ¥0.0060/条
 *   带推理 18453ms/条  输出 3780 token  ¥0.0150/条
 * 即快 21 倍、便宜 2.5 倍。deepseek-flash 默认是推理模型，不显式关掉，
 * reasoning_tokens 会占输出 80–99%。
 * 注：reasoning_effort:'low' 仍会推理（只是略少），只有 'none' 真正关闭；
 * thinking:{type:'disabled'} 同样有效。
 */
export const MODEL_PRESETS = {
  deepseek: {
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    responseFormat: 'json_object',
    extraBody: { reasoning_effort: 'none' }
  }
};

export const DEFAULT_RESPONSE_FORMAT = 'json_object';

export function resolvePreset(options = {}) {
  const preset = options.preset ? MODEL_PRESETS[options.preset] : null;
  if (options.preset && !preset) throw new Error(`未知预设：${options.preset}`);
  return {
    baseUrl: options.baseUrl || preset?.baseUrl || DEFAULT_BASE_URL,
    model: options.model || preset?.model || DEFAULT_MODEL,
    responseFormat: options.responseFormat || preset?.responseFormat || DEFAULT_RESPONSE_FORMAT,
    extraBody: { ...(preset?.extraBody || {}), ...(options.extraBody || {}) }
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
  // 职责标签是**软过滤**：闭集外的一律丢弃，但不作废整份输出。
  // 实测 DeepSeek 在 json_object 模式下会把 JD 原文的职责短语（「FBA发货处理」
  // 「商务谈判」）直接当标签返回，完全无视 prompt 里的闭集约束 —— 若按硬校验处理，
  // 同一份输出里合法的专业/学历原文引用会被一起扔掉，成功率掉到 5/8。
  const inClosedSet = (value, allowed) => {
    const out = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = String(item || '').trim();
      if (!text) continue;
      if (!allowed.includes(text)) continue;
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
  // 带模型：换抽取模型后必须重抽，否则会复用另一个模型产出的证据。
  return `${job.id || '(no-id)'}:${digest}:${model}`;
}

function responseFormatBody(mode) {
  if (mode === 'json_object') return { type: 'json_object' };
  return { type: 'json_schema', json_schema: buildSchema() };
}

async function callZen(job, options) {
  const {
    apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL,
    responseFormat = DEFAULT_RESPONSE_FORMAT,
    extraBody = {},
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
        response_format: responseFormatBody(responseFormat),
        ...extraBody,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: jobTextOf(job) }
        ]
      })
    });
    if (!res.ok) {
      // 把响应体带回来：端点拒收 response_format 时报的是 400，
      // 只说 "HTTP 400" 会让人完全看不出是格式不受支持。
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch {}
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

/** 端点是否在拒绝 response_format（而非别的 400）。 */
function looksLikeResponseFormatRejection(result) {
  return result?.status === 400 && /response_format|json_schema|unavailable/i.test(result?.detail || '');
}

/**
 * 抽取一条岗位的 JD 事实。
 * 成功返回 { source:'llm', ... }；任何失败返回 null（调用方回退正则）。
 * 不抛异常。
 */
export async function extractWithLlm(job = {}, options = {}) {
  const { apiKey, cache, onError, retries = 1 } = options;
  if (!apiKey) return null;

  const { baseUrl, model, responseFormat, extraBody } = resolvePreset(options);
  const key = cacheKey(job, model);
  const cached = cache?.get?.(key);
  if (cached) return cached;

  const jdText = jobTextOf(job);
  if (!hasJdBody(job)) return null; // 只有适配器摘要，抽取没有意义

  // 格式回退：预设给错或端点变了，就在同一个 job 上退回 json_object 再试一次，
  // 而不是把整批岗位都丢给正则。只在真的被拒时才多花一次调用。
  const formats = responseFormat === 'json_object' ? ['json_object'] : ['json_schema', 'json_object'];

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    for (let i = 0; i < formats.length; i += 1) {
      const result = await callZen(job, { ...options, baseUrl, model, extraBody, responseFormat: formats[i] });
      if (result.raw) {
        const evidence = validateEvidence(result.raw, jdText);
        if (evidence) {
          cache?.set?.(key, evidence);
          return evidence;
        }
        onError?.(`校验未通过（第 ${attempt + 1} 次）`);
        break; // 格式可用，是模型输出的问题 —— 换格式没用，交给下一次 attempt
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

/** 简易 JSON 文件缓存。调用方负责持久化，便于跨次刷新复用、避免重复计费。 */
export function createFileCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) || null,
    set: (key, value) => { map.set(key, value); },
    toJSON: () => Object.fromEntries(map)
  };
}
