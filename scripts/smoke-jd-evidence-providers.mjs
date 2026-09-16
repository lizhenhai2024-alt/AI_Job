#!/usr/bin/env node
/**
 * 手工 Provider smoke test：每个已配置 Provider 只发 1 条公开的合成 JD。
 * 用于配置 Secret 后先验证 Key / endpoint / model / JSON 输出兼容性，再跑全量 refresh。
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

const providers = resolveProviderChain(process.env);
const summary = ['## JD Evidence Provider Smoke Test', '', '| Provider | Model | Cost class | Result |', '| --- | --- | --- | --- |'];

if (!providers.length) {
  console.log('::warning::未配置任何 JD Evidence Provider Secret；没有执行外部 API smoke test');
  summary.push('| — | — | — | 未配置 Key |');
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`, 'utf8');
  process.exit(0);
}

let failed = 0;
for (const provider of providers) {
  const errors = [];
  const evidence = await extractWithLlm(JOB, {
    preset: provider.preset,
    apiKey: provider.apiKey,
    retries: 0,
    onError: (message) => errors.push(message)
  });
  if (evidence) {
    console.log(`[smoke] ${provider.preset}/${provider.model}: OK`);
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ✅ OK |`);
  } else {
    failed++;
    const detail = errors.join(' ').slice(0, 220) || 'no valid evidence returned';
    console.error(`::error::${provider.preset}/${provider.model} smoke test failed: ${detail}`);
    summary.push(`| ${provider.preset} | ${provider.model} | ${provider.costClass} | ❌ ${detail.replace(/\|/g, '\\|')} |`);
  }
}

summary.push('', '> 这里只发送仓库内合成的公开 JD 测试文本，不发送候选人简历或个人信息。');
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`, 'utf8');
process.exit(failed ? 1 : 0);
