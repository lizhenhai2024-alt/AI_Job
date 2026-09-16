#!/usr/bin/env node
/**
 * 手工 Provider smoke test：每个已配置 Provider/模型只发 1 条公开的合成 JD。
 *
 * 这是“生产链健康检查”，不是“所有模型必须同时健康”的考试：
 * - 每个模型都展示；未配置 Key 的 Provider 明确显示“跳过”，不再静默消失；
 * - 每个已配置模型仍单独展示结果；
 * - 只要链中至少一个 Provider 成功，workflow 整体通过；
 * - 若只有付费 DeepSeek 成功，会明确 warning“免费层当前不可用”；
 * - 所有已配置 Provider 都失败才退出 1。
 */
import fs from 'node:fs/promises';
import { extractWithLlm, resolveProviderChain } from './job-discovery/llm-evidence.mjs';

const JOB = {
  id: 'smoke-jd-evidence',
  company: 'Smoke Test',
  title: '海外市场运营专员',
  jobDescription: [
    '岗位职责：负责海外市场信息搜集、国际客户沟通、活动项目协调，并整理运营数据输出分析报告。',
    '任职资格：本科及以上学历，英语、国际贸易、市场营销等相关专业优先；英语可作为工作语言。',
    '招聘对象：2027届应届毕业生。'
  ].join('\n'),
  jobRequirements: ''
};

const providers = resolveProviderChain(process.env, { includeUnconfigured: true });
const configuredProviders = providers.filter((provider) => provider.apiKey);
const summary = [
  '## JD Evidence Provider Smoke Test', '',
  '| Provider | Model | Cost class | Result |',
  '| --- | --- | --- | --- |'
];

if (!configuredProviders.length) {
  console.log('::warning::未配置任何 JD Evidence Provider Secret；没有执行外部 API smoke test');
  for (const provider of providers) {
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ⏭️ 未配置 Key |`);
  }
  if (!providers.length) summary.push('| — | — | — | 未配置 Key |');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`, 'utf8');
  }
  process.exit(0);
}

let success = 0;
let freeSuccess = 0;
let paidSuccess = 0;
let failures = 0;
let skipped = 0;

for (const provider of providers) {
  if (!provider.apiKey) {
    skipped++;
    console.log(`[smoke] ${provider.preset}/${provider.model}: SKIP (未配置 Key)`);
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ⏭️ 未配置 Key |`);
    continue;
  }

  const errors = [];
  const evidence = await extractWithLlm(JOB, {
    preset: provider.preset,
    apiKey: provider.apiKey,
    retries: 0,
    onError: (message) => errors.push(message)
  });

  if (evidence) {
    success++;
    if (provider.costClass === 'paid') paidSuccess++; else freeSuccess++;
    console.log(`[smoke] ${provider.preset}/${provider.model}: OK`);
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ✅ OK |`);
  } else {
    failures++;
    const detail = errors.join(' ').slice(0, 260) || 'no valid evidence returned';
    console.warn(`::warning::${provider.preset}/${provider.model} smoke test failed: ${detail}`);
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ⚠️ ${detail.replace(/\|/g, '\\|')} |`);
  }
}

summary.push('');
if (success === 0) {
  const message = `❌ 生产链不可用：${failures} 个已配置 Provider/模型全部失败；${skipped} 个未配置。`;
  summary.push(`> ${message}`);
  console.error(`::error::${message}`);
} else if (freeSuccess === 0 && paidSuccess > 0) {
  const message = `⚠️ 生产链可用，但当前只有付费兜底成功；Gemini 免费层暂不可用。未配置 ${skipped} 个。`;
  summary.push(`> ${message}`);
  console.warn(`::warning::${message}`);
} else if (failures > 0 || skipped > 0) {
  const message = `✅ 生产链可用：免费层成功 ${freeSuccess} 个${paidSuccess ? `，付费成功 ${paidSuccess} 个` : ''}；失败 ${failures} 个，未配置 ${skipped} 个，自动降级正常。`;
  summary.push(`> ${message}`);
  console.log(message);
} else {
  const message = `✅ 生产链全部通过：成功 ${success} 个。`;
  summary.push(`> ${message}`);
  console.log(message);
}

summary.push('', '> 这里只发送仓库内合成的公开 JD 测试文本，不发送候选人简历或个人信息。');
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`, 'utf8');
}
process.exit(success > 0 ? 0 : 1);
