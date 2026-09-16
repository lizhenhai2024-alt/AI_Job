#!/usr/bin/env node
/**
 * 报告 LLM 证据覆盖率与 Provider 分布。
 * 不调模型、不读取 Secret 值；CI 只传“是否配置”的布尔。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isLlmEvidence, resolveJdEvidence } from './job-discovery/policy.mjs';

const root = process.env.JD_EVIDENCE_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const cachePath = path.join(root, 'src/data/jd-evidence-cache.json');

function boolEnv(name, fallback = false) {
  if (process.env[name] === 'true') return true;
  if (process.env[name] === 'false') return false;
  return fallback;
}

const zenConfigured = boolEnv('OPENCODE_ZEN_KEY_CONFIGURED', Boolean(process.env.OPENCODE_ZEN_API_KEY));
const geminiConfigured = boolEnv('GEMINI_KEY_CONFIGURED', Boolean(process.env.GEMINI_API_KEY));
const deepseekConfigured = boolEnv('DEEPSEEK_KEY_CONFIGURED', Boolean(process.env.JD_EVIDENCE_API_KEY || process.env.DEEPSEEK_API_KEY));
// 兼容旧 workflow / 测试：若显式给了总开关，以它为准；否则由三个 Provider 汇总。
const keyConfigured = process.env.JD_EVIDENCE_KEY_CONFIGURED
  ? process.env.JD_EVIDENCE_KEY_CONFIGURED === 'true'
  : (zenConfigured || geminiConfigured || deepseekConfigured);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const liveModule = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
const jobs = Array.isArray(liveModule.liveJobs) ? liveModule.liveJobs : [];

let llm = 0;
let regexOnly = 0;
let noEvidence = 0;
let completeJd = 0;
let completeJdLlm = 0;
const normLen = (v) => String(v || '').replace(/\s+/g, '').length;
const isCompleteJd = (job) => {
  const d = normLen(job.jobDescription), r = normLen(job.jobRequirements);
  return d >= 40 && r >= 40 && d + r >= 120;
};
const providerCounts = { zen: 0, gemini: 0, deepseek: 0, legacy: 0, other: 0 };

function providerBucket(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('zen-free') || s.includes('mimo-v2.5-free') || s.includes('opencode')) return 'zen';
  if (s.includes('gemini-free') || s.includes('gemini-')) return 'gemini';
  if (s.includes('deepseek')) return 'deepseek';
  if (s.startsWith('llm:')) return 'legacy';
  return 'other';
}

for (const job of jobs) {
  const complete = isCompleteJd(job);
  if (complete) completeJd++;
  if (isLlmEvidence(job.jdEvidence)) {
    llm++;
    if (complete) completeJdLlm++;
    providerCounts[providerBucket(job.jdEvidence?.source)]++;
    continue;
  }
  const e = resolveJdEvidence(job);
  const has = ['majorClauses', 'eligibilityClauses', 'businessDuties', 'technicalDuties']
    .some((k) => Array.isArray(e?.[k]) && e[k].length > 0);
  if (has) regexOnly++; else noEvidence++;
}

const cache = await readJson(cachePath, {});
const cacheEntries = cache && typeof cache === 'object' ? Object.keys(cache).length : 0;
const pct = jobs.length ? (llm / jobs.length) * 100 : 0;

const lines = [
  '## JD 证据覆盖率',
  '',
  '| 项 | 值 |',
  '| --- | --- |',
  `| 岗位总数 | ${jobs.length} |`,
  `| 完整 JD（职责+要求） | ${completeJd} |`,
  `| 完整 JD 已经 AI 分析 | ${completeJdLlm}（${completeJd ? ((completeJdLlm / completeJd) * 100).toFixed(1) : '0.0'}%） |`,
  `| LLM 抽取 | ${llm}（${pct.toFixed(1)}%） |`,
  `| 仅正则 | ${regexOnly} |`,
  `| 无任何证据 | ${noEvidence} |`,
  `| 抽取缓存条目 | ${cacheEntries} |`,
  `| 本轮是否配置密钥 | ${keyConfigured ? '是' : '否'} |`,
  '',
  '### Provider 状态',
  '',
  '| Provider | Key | 当前池 LLM 证据 |',
  '| --- | --- | ---: |',
  `| OpenCode Zen / mimo-v2.5-free | ${zenConfigured ? '已配置' : '未配置'} | ${providerCounts.zen} |`,
  `| Gemini Free Tier | ${geminiConfigured ? '已配置' : '未配置'} | ${providerCounts.gemini} |`,
  `| DeepSeek paid fallback | ${deepseekConfigured ? '已配置' : '未配置'} | ${providerCounts.deepseek} |`,
  `| 历史/其它 LLM source | — | ${providerCounts.legacy + providerCounts.other} |`,
  ''
];

for (const l of lines.slice(2)) {
  if (!l.startsWith('| ---')) console.log('[jd-evidence:coverage] ' + l.replace(/^\| | \|$/g, '').replace(/ \| /g, ' = '));
}

let exitCode = 0;
if (!keyConfigured && llm === 0) {
  lines.push('> ⚠️ **LLM 增强未启用**：Zen / Gemini / DeepSeek 均未配置 Key，本池全部为正则级证据。');
  console.log('::warning::LLM 增强未启用（未配置任何 JD Evidence Provider Key），当前证据全为正则级');
} else if (keyConfigured && jobs.length > 0 && llm === 0 && cacheEntries === 0) {
  lines.push('> ❌ **已配置密钥但零产出**：抽取阶段接好了却没有产出任何证据。');
  // 保留旧前缀，避免旧监控/测试因文案改变失效。
  console.log('::error::已配置 JD_EVIDENCE_API_KEY 但岗位池与缓存中均无 LLM 证据（也可能配置的是 Zen/Gemini Key）');
  exitCode = 1;
} else {
  lines.push(`> ✅ LLM 证据 ${llm} 条（${pct.toFixed(1)}%），缓存 ${cacheEntries} 条。`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  await fs.appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

process.exit(exitCode);
