import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cacheKey, resolvePreset } from '../scripts/job-discovery/llm-evidence.mjs';

// 这个文件钉住的是「已付费的 LLM 证据能不能活过一轮刷新」。
//
// 背景：refresh-jobs.mjs 从抓取结果重建整个岗位池（旧池只在不健康源时才保留），
// 所以上一轮的 jdEvidence 不会自己跟过来。缓存键是 id:JD哈希:模型，对同一个岗位
// 依然命中——如果命中时只是 continue 跳过，证据就永远补不回来：
// 缓存从"省钱的备忘录"变成"阻止恢复的墓碑"。
//
// 测试方式：复制一份 scripts/ 到临时目录（enrich 以自身位置推导 root），
// 造一个"刷新刚抹掉证据"的岗位池，跑真实的 enrich 脚本。

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts');
const MODEL = resolvePreset({ preset: 'deepseek' }).model;

// 注意：这段 JD 刻意不含「XX专业/学历」这类词。否则正则能抽出 majorClauses，
// 岗位会被 ONLY_WEAK 判为「已覆盖」而跳过，测不到缓存回灌这条路径。
const WEAK_JD = '岗位职责：负责跟进客户需求与渠道维护，整理市场反馈并输出周报；'
  + '协助团队完成日常运营支持工作。任职资格：沟通表达清晰，能适应快节奏协作，对数据敏感，做事细致。';
// 反过来，这段含专业限定，正则抽得到，用来验证原有的省钱行为没被改坏。
const STRONG_JD = '岗位职责：负责海外市场推广与国际客户沟通，跟进国际业务落地与渠道维护，'
  + '整理投放数据并输出复盘结论，协助团队完成年度市场目标。'
  + '任职资格：本科及以上学历，英语或国际贸易专业优先，具备良好的跨文化沟通能力。';

function job(id, extra = {}) {
  return {
    id,
    company: '示例公司',
    title: '市场运营专员',
    city: '深圳',
    jobDescription: WEAK_JD,
    jobRequirements: '做事细致，有责任心。',
    ...extra
  };
}

// 造一个临时仓库：scripts/ 是真实代码的副本，src/data/ 是夹具。
function fixture(liveJobs, cache) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-enrich-'));
  fs.cpSync(SCRIPTS, path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data/live-jobs.js'),
    `export const liveJobs = ${JSON.stringify(liveJobs, null, 2)};\nexport const discoveryMeta = {"totalJobs":${liveJobs.length}};\n`,
    'utf8');
  fs.writeFileSync(path.join(root, 'src/data/jd-evidence-cache.json'),
    JSON.stringify(cache || {}, null, 1), 'utf8');
  return root;
}

function run(root, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/enrich-jd-evidence.mjs')], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, JD_EVIDENCE_API_KEY: '', DEEPSEEK_API_KEY: '', ...env }
  });
}

function readJobs(root) {
  const text = fs.readFileSync(path.join(root, 'src/data/live-jobs.js'), 'utf8');
  return JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
}

const EVIDENCE = {
  source: 'llm',
  majorClauses: ['英语或国际贸易专业优先'],
  eligibilityClauses: [],
  businessDuties: ['负责海外市场推广'],
  technicalDuties: []
};

test('刷新抹掉证据后，缓存命中应把证据写回岗位（无需密钥）', () => {
  const lost = job('j1');                       // 刷新后的岗位：没有任何 jdEvidence
  const root = fixture([lost], { [cacheKey(lost, MODEL)]: EVIDENCE });

  const r = run(root);                          // 故意不给密钥
  assert.equal(r.status, 0);
  assert.match(r.stdout, /缓存命中=1\(回灌=1\)/);

  const [after] = readJobs(root);
  assert.ok(after.jdEvidence, '证据必须被回灌');
  assert.equal(after.jdEvidence.source, `llm:${MODEL}`, '来源应标记为 LLM');
  assert.deepEqual(after.jdEvidence.majorClauses, EVIDENCE.majorClauses, '事实内容应逐字保留');
});

test('回灌要落盘，否则下一轮刷新又丢', () => {
  const lost = job('j1');
  const root = fixture([lost], { [cacheKey(lost, MODEL)]: EVIDENCE });
  run(root);
  const text = fs.readFileSync(path.join(root, 'src/data/live-jobs.js'), 'utf8');
  assert.match(text, /llm:deepseek-flash/);
});

test('已有 LLM 证据的岗位不重复回灌（幂等）', () => {
  const already = job('j1', { jdEvidence: { ...EVIDENCE, source: `llm:${MODEL}` } });
  const root = fixture([already], { [cacheKey(already, MODEL)]: EVIDENCE });
  const r = run(root);
  assert.match(r.stdout, /缓存命中=1\(回灌=0\)/);
});

test('换了模型则缓存不命中，岗位留待重抽', () => {
  const lost = job('j1');
  // 用另一个模型的键写缓存，当前模型不应命中
  const root = fixture([lost], { [cacheKey(lost, 'some-other-model')]: EVIDENCE });
  const r = run(root);
  assert.match(r.stdout, /缓存命中=0\(回灌=0\)/);
  assert.match(r.stdout, /待抽=1/, '换模型后必须重抽，不能复用别的模型产出的证据');
});

test('正则已覆盖且无缓存时，仍按 ONLY_WEAK 跳过（不改变原有省钱行为）', () => {
  const strong = job('j1', {
    jobDescription: STRONG_JD,
    jdEvidence: { source: 'regex', majorClauses: ['英语或国际贸易专业优先'], eligibilityClauses: [], businessDuties: [], technicalDuties: [] }
  });
  const root = fixture([strong], {});
  const r = run(root);
  assert.match(r.stdout, /正则已覆盖=1\(跳过\)/);
  assert.match(r.stdout, /待抽=0/);
});

test('无新抽取且无回灌时不动任何文件', () => {
  const root = fixture([job('j1')], {});
  const before = fs.readFileSync(path.join(root, 'src/data/live-jobs.js'), 'utf8');
  const r = run(root, { JD_EVIDENCE_API_KEY: 'sk-test' });   // 有待抽才会走到落盘判断
  assert.match(r.stdout, /本轮无成功抽取，不改动任何文件/);
  assert.equal(fs.readFileSync(path.join(root, 'src/data/live-jobs.js'), 'utf8'), before);
});
