#!/usr/bin/env node
/**
 * 报告 LLM 证据覆盖率 —— 让「增强阶段其实没在跑」这件事可见。
 *
 * 为什么需要：enrich-jd-evidence 在没有密钥时**故意**退出 0（设计内的降级路径，
 * 见该文件顶部注释）。这在单机上是对的，但在 CI 里意味着一件坏事：
 * 一个配了 LLM 增强、按 ¥24/轮 估过成本、写了抽取器和预设的管线，
 * 可以整月以「绿色通过」的状态什么都没做，而没有任何地方会说出来。
 *
 * 这与本仓库此前两次静默降级是同一类问题（campus 侧 candidateFit 消失导致
 * 97% 岗位降级、下游手抄正则漂移）。事实只在上游定义一次，那么「这个事实到底
 * 有没有被生产出来」也应当被显式报告一次。
 *
 * 本脚本：
 *   - 不调模型、不需要密钥，任何机器上都能跑
 *   - 判「什么算 LLM 证据」复用 policy.mjs 的 isLlmEvidence，不另立标准
 *   - 写到 $GITHUB_STEP_SUMMARY（如果存在），让运行页上直接看得见
 *   - 未启用 → ::warning::（不失败：夜间刷新本身是有价值的，不该因此中断）
 *     已启用却零产出 → ::error::（那是真故障：接好了但不工作）
 *
 * 用法：node scripts/report-jd-evidence-coverage.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isLlmEvidence, resolveJdEvidence } from './job-discovery/policy.mjs';

const root = process.env.JD_EVIDENCE_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const cachePath = path.join(root, 'src/data/jd-evidence-cache.json');

// CI 传布尔（`${{ secrets.X != '' }}`），不把密钥本身交给这个只做统计的步骤；
// 本地直接跑时退回读真实环境变量，这样两台机器上行为一致。
const keyConfigured = process.env.JD_EVIDENCE_KEY_CONFIGURED
  ? process.env.JD_EVIDENCE_KEY_CONFIGURED === 'true'
  : Boolean(process.env.JD_EVIDENCE_API_KEY || process.env.DEEPSEEK_API_KEY);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const liveModule = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
const jobs = Array.isArray(liveModule.liveJobs) ? liveModule.liveJobs : [];

// 三档：LLM 抽的 / 只有正则的 / 连正则都没抽到东西的。
let llm = 0;
let regexOnly = 0;
let noEvidence = 0;
for (const job of jobs) {
  if (isLlmEvidence(job.jdEvidence)) { llm++; continue; }
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
  `| 项 | 值 |`,
  `| --- | --- |`,
  `| 岗位总数 | ${jobs.length} |`,
  `| LLM 抽取 | ${llm}（${pct.toFixed(1)}%） |`,
  `| 仅正则 | ${regexOnly} |`,
  `| 无任何证据 | ${noEvidence} |`,
  `| 抽取缓存条目 | ${cacheEntries} |`,
  `| 本轮是否配置密钥 | ${keyConfigured ? '是' : '否'} |`,
  '',
];
// 控制台也打一份，方便本地直接跑。
for (const l of lines.slice(2)) if (!l.startsWith('| ---')) console.log('[jd-evidence:coverage] ' + l.replace(/^\| | \|$/g, '').replace(/ \| /g, ' = '));

let exitCode = 0;
if (!keyConfigured && llm === 0) {
  lines.push('> ⚠️ **LLM 增强未启用**：未配置 `JD_EVIDENCE_API_KEY`，本池全部为正则级证据。');
  lines.push('> 这是设计内的降级路径（刷新不受影响），但若你期望的是 LLM 证据，说明密钥没配上。');
  console.log('::warning::LLM 增强未启用（未配置 JD_EVIDENCE_API_KEY），当前证据全为正则级');
} else if (keyConfigured && jobs.length > 0 && llm === 0 && cacheEntries === 0) {
  // 空池不算「接好了却不工作」——那说明数据本身有问题，不是抽取阶段的问题。
  lines.push('> ❌ **已配置密钥但零产出**：抽取阶段接好了却没有产出任何证据。');
  console.log('::error::已配置 JD_EVIDENCE_API_KEY 但岗位池与缓存中均无 LLM 证据');
  exitCode = 1;
} else {
  lines.push(`> ✅ LLM 证据 ${llm} 条（${pct.toFixed(1)}%），缓存 ${cacheEntries} 条。`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  await fs.appendFile(summaryPath, lines.join('\n') + '\n', 'utf8');
}

process.exit(exitCode);
