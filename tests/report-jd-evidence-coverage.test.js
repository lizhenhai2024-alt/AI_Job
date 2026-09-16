import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 这个文件钉住的是「LLM 增强到底有没有在跑」这件事的可见性。
// 背景：enrich-jd-evidence 没有密钥时故意退出 0（设计内的降级路径），
// 于是配了 LLM 的管线可以整月绿色通过却什么都没做，而没人会知道。
// 覆盖率报告就是那个把它说出来的人，所以三种状态都必须精确。

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../scripts/report-jd-evidence-coverage.mjs');

function fixture(jobs, cache) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-cov-'));
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data/live-jobs.js'),
    `export const liveJobs = ${JSON.stringify(jobs, null, 2)};\nexport const discoveryMeta = {};\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'src/data/jd-evidence-cache.json'),
    JSON.stringify(cache || {}, null, 1), 'utf8');
  return root;
}

function run(root, env = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      JD_EVIDENCE_ROOT: root,
      // 清掉本机可能存在的真实密钥，测试只认显式传入的布尔
      JD_EVIDENCE_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      JD_EVIDENCE_KEY_CONFIGURED: '',
      GITHUB_STEP_SUMMARY: '',
      ...env
    }
  });
}

const LLM_JOB = { id: 'a', jdEvidence: { source: 'llm:deepseek-flash', majorClauses: ['计算机专业'] } };
const REGEX_JOB = { id: 'b', jdEvidence: { source: 'regex', majorClauses: ['市场营销'] } };
const EMPTY_JOB = { id: 'c' };

test('未配置密钥且零 LLM 证据：warning，不失败', () => {
  const r = run(fixture([REGEX_JOB, EMPTY_JOB]), { JD_EVIDENCE_KEY_CONFIGURED: 'false' });
  assert.equal(r.status, 0, '设计内的降级路径不该让刷新失败');
  assert.match(r.stdout, /::warning::LLM 增强未启用/);
  assert.doesNotMatch(r.stdout, /::error::/);
});

test('已配置密钥但零产出：error，退出码 1', () => {
  const r = run(fixture([REGEX_JOB]), { JD_EVIDENCE_KEY_CONFIGURED: 'true' });
  assert.equal(r.status, 1, '接好了却不工作是真故障，必须失败');
  assert.match(r.stdout, /::error::已配置 JD_EVIDENCE_API_KEY 但/);
});

test('已有 LLM 证据：干净通过，两种注解都不出现', () => {
  const r = run(fixture([LLM_JOB, REGEX_JOB, EMPTY_JOB]), { JD_EVIDENCE_KEY_CONFIGURED: 'true' });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /::warning::/);
  assert.doesNotMatch(r.stdout, /::error::/);
});

test('三档分类互斥且总数守恒', () => {
  const r = run(fixture([LLM_JOB, REGEX_JOB, EMPTY_JOB]), { JD_EVIDENCE_KEY_CONFIGURED: 'true' });
  const num = (label) => Number((r.stdout.match(new RegExp(`${label} = (\\d+)`)) || [])[1]);
  assert.equal(num('LLM 抽取'), 1);
  assert.equal(num('仅正则'), 1);
  assert.equal(num('无任何证据'), 1);
  assert.equal(num('岗位总数'), 3);
});

test('本地未显式传布尔时，退回读真实环境变量', () => {
  const root = fixture([REGEX_JOB]);
  const withKey = run(root, { DEEPSEEK_API_KEY: 'sk-test' });
  assert.equal(withKey.status, 1, '本地有密钥却零产出，同样应报错');
  const without = run(root);
  assert.equal(without.status, 0);
  assert.match(without.stdout, /::warning::/);
});

test('写出 GITHUB_STEP_SUMMARY，供运行页展示', () => {
  const root = fixture([LLM_JOB, REGEX_JOB]);
  const summary = path.join(root, 'summary.md');
  const r = run(root, { JD_EVIDENCE_KEY_CONFIGURED: 'true', GITHUB_STEP_SUMMARY: summary });
  assert.equal(r.status, 0);
  const text = fs.readFileSync(summary, 'utf8');
  assert.match(text, /## JD 证据覆盖率/);
  assert.match(text, /\| LLM 抽取 \| 1（50\.0%） \|/);
});

test('空岗位池不炸（分母为 0）', () => {
  const r = run(fixture([]), { JD_EVIDENCE_KEY_CONFIGURED: 'true' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /岗位总数 = 0/);
});
