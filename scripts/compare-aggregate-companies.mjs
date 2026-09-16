// 校招聚合求职渠道 × 公司清单融合对比
// 读取 live-jobs.js 中 secondary 来源（猎聘校园/牛客公开职位等聚合渠道）岗位的公司名，
// 与 config/company-requests.json（539 家）归一化匹配：
//   - 清单内命中：聚合渠道佐证的公司（岗位数、角色分布）
//   - 清单外新增：聚合渠道发现、清单未覆盖的公司候选（可补充进清单）
// 输出：控制台报告 + docs/aggregate-channel-report.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { liveJobs } = await import(pathToFileURL(path.join(root, 'src/data/live-jobs.js')).href);
const companyRequests = JSON.parse(fs.readFileSync(path.join(root, 'config/company-requests.json'), 'utf8'));
const requests = Array.isArray(companyRequests) ? companyRequests : companyRequests.companies || [];

// 公司名归一化：去法律主体后缀/集团/股份等
function normalizeCompany(name = '') {
  return String(name)
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .replace(/(股份有限公司|有限责任公司|有限公司|股份公司|集团公司|集团|公司)$/, '')
    .replace(/(中国|北京|上海|深圳|广州|杭州|武汉|长沙|苏州|南京|天津|重庆|成都|厦门|珠海|东莞|佛山|青岛|宁波|大连|西安|郑州|福州|昆明|无锡|合肥|济南|南昌|太原|石家庄|哈尔滨|长春|沈阳)/g, '')
    .replace(/[\s|｜·\-—]+/g, '')
    .trim();
}

const requestNames = new Map();
for (const req of requests) {
  if (!req?.name) continue;
  const norm = normalizeCompany(req.name);
  if (norm && norm.length >= 2) requestNames.set(norm, req.name);
}
const requestSet = new Set(requestNames.keys());

// 清单内名称集合（原样 + 归一化）
const aggregateJobs = liveJobs.filter((j) => j.sourceType === 'secondary');
const byCompany = new Map();
for (const job of aggregateJobs) {
  const c = String(job.company || '待核公司');
  if (c === '待核公司') continue;
  const item = byCompany.get(c) || { company: c, count: 0, sources: new Set(), cities: new Set(), roles: new Set(), sampleTitles: [] };
  item.count += 1;
  if (job.source) item.sources.add(job.source);
  if (job.city) item.cities.add(job.city);
  for (const r of job.roleFamily || []) item.roles.add(r);
  if (item.sampleTitles.length < 3) item.sampleTitles.push(job.title);
  byCompany.set(c, item);
}

const matched = [];
const unmatched = [];
for (const item of byCompany.values()) {
  const norm = normalizeCompany(item.company);
  if (norm && (requestSet.has(norm) || [...requestNames.keys()].some((k) => norm.includes(k) || k.includes(norm)))) {
    matched.push(item);
  } else {
    unmatched.push(item);
  }
}

matched.sort((a, b) => b.count - a.count);
unmatched.sort((a, b) => b.count - a.count);

const report = [];
report.push('# 校招聚合渠道 × 公司清单融合对比报告');
report.push('');
report.push(`- 生成时间：${new Date().toISOString().slice(0, 19)}`);
report.push(`- 数据源：live-jobs.js（${liveJobs.length} 条）中 secondary 聚合渠道岗位 ${aggregateJobs.length} 条`);
report.push(`- 公司清单：config/company-requests.json（${requests.length} 家）`);
report.push('');
report.push(`## 汇总`);
report.push('');
report.push(`| 指标 | 数值 |`);
report.push(`| --- | --- |`);
report.push(`| 聚合渠道去重公司数 | ${byCompany.size} |`);
report.push(`| 清单内命中公司 | ${matched.length}（岗位 ${matched.reduce((s, x) => s + x.count, 0)} 条） |`);
report.push(`| 清单外候选公司 | ${unmatched.length}（岗位 ${unmatched.reduce((s, x) => s + x.count, 0)} 条） |`);
report.push('');
report.push(`## 清单内命中公司（聚合渠道佐证）`);
report.push('');
report.push(`| 公司 | 岗位数 | 来源 | 城市 | 角色 | 样例岗位 |`);
report.push(`| --- | ---: | --- | --- | --- | --- |`);
for (const item of matched.slice(0, 40)) {
  report.push(`| ${item.company} | ${item.count} | ${[...item.sources].join('/')} | ${[...item.cities].slice(0, 4).join('/')} | ${[...item.roles].slice(0, 3).join('/')} | ${item.sampleTitles.join('；')} |`);
}
report.push('');
report.push(`## 清单外候选公司（可补充进公司清单）`);
report.push('');
report.push(`| 公司 | 岗位数 | 来源 | 城市 | 样例岗位 |`);
report.push(`| --- | ---: | --- | --- | --- |`);
for (const item of unmatched.slice(0, 60)) {
  report.push(`| ${item.company} | ${item.count} | ${[...item.sources].join('/')} | ${[...item.cities].slice(0, 4).join('/')} | ${item.sampleTitles.join('；')} |`);
}

const reportPath = path.join(root, 'docs/aggregate-channel-report.md');
fs.writeFileSync(reportPath, report.join('\n'), 'utf8');

console.log(`[aggregate-compare] secondary=${aggregateJobs.length} 公司=${byCompany.size} 命中=${matched.length} 候选=${unmatched.length}`);
console.log(`[aggregate-compare] 报告已写入 docs/aggregate-channel-report.md`);
console.log('');
console.log('=== 清单外候选 Top 20（可补充） ===');
for (const item of unmatched.slice(0, 20)) {
  console.log(`  ${item.company}（${item.count} 岗，${[...item.sources].join('/')}）`);
}
