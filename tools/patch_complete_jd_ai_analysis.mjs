#!/usr/bin/env node
import fs from 'node:fs';

function patch(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!s.includes(from)) throw new Error(`${path}: marker not found: ${from.slice(0, 80)}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s, 'utf8');
}

patch('scripts/enrich-jd-evidence.mjs', [
  [" *   JD_EVIDENCE_ONLY_WEAK        默认 1，只补正则抽不到专业原文的岗位\n",
   " *   JD_EVIDENCE_COMPLETE_ONLY    默认 1，只分析岗位说明+任职要求都完整的 JD\n *   JD_EVIDENCE_MIN_SECTION_CHARS  单个职责/要求字段最少有效字符，默认 40\n *   JD_EVIDENCE_MIN_TOTAL_CHARS    两字段合计最少有效字符，默认 120\n *   JD_EVIDENCE_ONLY_WEAK        默认 0；0=完整 JD 全部做 AI 事实分析，1=只补弱证据\n"],
  ["const ONLY_WEAK = process.env.JD_EVIDENCE_ONLY_WEAK !== '0';\n",
   "const COMPLETE_ONLY = process.env.JD_EVIDENCE_COMPLETE_ONLY !== '0';\nconst MIN_SECTION_CHARS = Math.max(1, Number(process.env.JD_EVIDENCE_MIN_SECTION_CHARS || 40));\nconst MIN_TOTAL_CHARS = Math.max(MIN_SECTION_CHARS * 2, Number(process.env.JD_EVIDENCE_MIN_TOTAL_CHARS || 120));\nconst ONLY_WEAK = process.env.JD_EVIDENCE_ONLY_WEAK === '1';\n\nfunction contentLen(value) {\n  return String(value || '').replace(/\\s+/g, '').length;\n}\n\nexport function hasCompleteJdSections(job = {}) {\n  const desc = contentLen(job.jobDescription);\n  const req = contentLen(job.jobRequirements);\n  return desc >= MIN_SECTION_CHARS && req >= MIN_SECTION_CHARS && (desc + req) >= MIN_TOTAL_CHARS;\n}\n"],
  ["let thin = 0;\nlet strong = 0;\nlet cached = 0;\nfor (const job of jobs) {\n  if (!hasJdBody(job)) { thin++; continue; }\n",
   "let thin = 0;\nlet incomplete = 0;\nlet complete = 0;\nlet strong = 0;\nlet cached = 0;\nfor (const job of jobs) {\n  if (!hasJdBody(job)) { thin++; continue; }\n  if (COMPLETE_ONLY && !hasCompleteJdSections(job)) { incomplete++; continue; }\n  complete++;\n"],
  ["console.log(`[jd-evidence] jobs=${jobs.length} 太薄跳过=${thin} 正则已覆盖=${ONLY_WEAK ? strong : 0}(跳过) 缓存命中=${cached}(回灌=${restored}) 待抽=${pending.length}`);\n",
   "console.log(`[jd-evidence] jobs=${jobs.length} 完整JD=${complete} JD不完整跳过=${incomplete} 太薄跳过=${thin} 正则已覆盖=${ONLY_WEAK ? strong : 0}(跳过) 缓存命中=${cached}(回灌=${restored}) 待AI分析=${pending.length}`);\n"]
]);

patch('scripts/report-jd-evidence-coverage.mjs', [
  ["let llm = 0;\nlet regexOnly = 0;\nlet noEvidence = 0;\n",
   "let llm = 0;\nlet regexOnly = 0;\nlet noEvidence = 0;\nlet completeJd = 0;\nlet completeJdLlm = 0;\nconst normLen = (v) => String(v || '').replace(/\\s+/g, '').length;\nconst isCompleteJd = (job) => {\n  const d = normLen(job.jobDescription), r = normLen(job.jobRequirements);\n  return d >= 40 && r >= 40 && d + r >= 120;\n};\n"],
  ["for (const job of jobs) {\n  if (isLlmEvidence(job.jdEvidence)) {\n    llm++;\n",
   "for (const job of jobs) {\n  const complete = isCompleteJd(job);\n  if (complete) completeJd++;\n  if (isLlmEvidence(job.jdEvidence)) {\n    llm++;\n    if (complete) completeJdLlm++;\n"],
  ["  `| LLM 抽取 | ${llm}（${pct.toFixed(1)}%） |`,\n",
   "  `| 完整 JD（职责+要求） | ${completeJd} |`,\n  `| 完整 JD 已经 AI 分析 | ${completeJdLlm}（${completeJd ? ((completeJdLlm / completeJd) * 100).toFixed(1) : '0.0'}%） |`,\n  `| LLM 抽取 | ${llm}（${pct.toFixed(1)}%） |`,\n"]
]);

patch('docs/jd-evidence-providers.md', [
  ["默认只对“正则没有抽到专业原文”的弱证据岗位调用 LLM；已有强正则证据的岗位跳过。缓存按 `岗位ID + JD哈希 + 模型` 复用，JD 没变化就不会重复占用额度。\n",
   "当前生产策略只对 **岗位说明(jobDescription) 与任职要求(jobRequirements) 都完整** 的岗位调用 LLM：单字段至少 40 个有效字符，两字段合计至少 120 个有效字符。完整 JD 会全部执行 AI 事实分析，不再因为正则已经抽到专业原文而跳过；JD 不完整的岗位保留正则解析，等待官网后续补全。缓存按 `岗位ID + JD哈希 + 模型` 复用，JD 没变化就不会重复占用额度。\n"]
]);

console.log('patched complete-JD AI analysis policy');
