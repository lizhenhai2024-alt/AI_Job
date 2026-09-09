#!/usr/bin/env node
/**
 * Imports the maintained Markdown company lists into the browser-side company
 * library.  The Markdown source stays deliberately separate from live jobs:
 * a company can be monitored without claiming that it has a verified opening.
 *
 * Usage:
 *   node scripts/import-company-library.mjs /absolute/path/to/markdown-folder
 */
import fs from 'node:fs';
import path from 'node:path';

const inputDir = process.argv[2];
if (!inputDir || !fs.statSync(inputDir).isDirectory()) {
  throw new Error('Provide the directory containing the uploaded Markdown lists.');
}

const files = fs.readdirSync(inputDir).filter((name) => name.endsWith('.md'));
const mainName = files.find((name) => name.includes('公司清单_按行业分类'));
const opportunitiesName = files.find((name) => name.includes('机会清单_已启动校招'));
if (!mainName || !opportunitiesName) throw new Error('Missing master company list or started-opportunities list.');

const canonical = (value = '') => String(value)
  .replace(/\[.*?\]\(.*?\)/g, '')
  .replace(/[（(].*?[）)]/g, '')
  .replace(/[【\[\]、】【，,、·•：:;；]/g, '')
  .replace(/股份有限公司|集团有限公司|有限公司|集团|控股/g, '')
  .toLowerCase()
  .trim();
const cleanName = (value = '') => String(value).replace(/[（(].*?[）)]/g, '').trim();
const splitNames = (value) => value.replace(/[（(][^）)]*[）)]/g, '').split(/[、，,]/).map((item) => cleanName(item)).filter((item) => item && item.length < 40 && !/^(品牌终端|整车|零部件|其他|大型|垂直|综合|出海|快递|工业|动力|光伏|输变电|游戏|内容|网络|数据|晶圆|半导体|机器人|核心|医疗|酒水|农牧)/.test(item));
const statusRank = { '主投': 4, '观察': 3, '风险': 2, '移出': 1 };
const records = new Map();
const opportunityEvidence = new Map();

function upsert(rawName, patch) {
  const name = cleanName(rawName);
  const key = canonical(name);
  if (!key || name.length > 40) return;
  const existing = records.get(key) || {
    id: `company-${key.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 48)}`,
    name, aliases: [], statuses: [], industries: [], cities: [], targetTracks: [], sources: []
  };
  // The four-pool master list is authoritative.  Supplementary city tables
  // and opportunity rows add evidence but must not silently change its pool.
  if (patch.status && (patch.authoritative || !existing.status)) existing.status = patch.status;
  for (const field of ['aliases', 'industries', 'cities', 'targetTracks', 'sources']) {
    for (const value of patch[field] || []) if (value && !existing[field].includes(value)) existing[field].push(value);
  }
  if (patch.status && !existing.statuses.includes(patch.status)) existing.statuses.push(patch.status);
  records.set(key, existing);
}

// Master list: the bold category rows are the authoritative pool membership.
let sectionStatus = null;
let currentIndustry = '';
for (const line of fs.readFileSync(path.join(inputDir, mainName), 'utf8').split(/\r?\n/)) {
  if (/^## 保留主投池/.test(line)) sectionStatus = '主投';
  else if (/^## 观察池/.test(line)) sectionStatus = '观察';
  else if (/^## 风险观察/.test(line)) sectionStatus = '风险';
  else if (/^## 移出主投池/.test(line)) sectionStatus = '移出';
  else if (/^## /.test(line)) sectionStatus = null;
  const category = line.match(/^- \*\*(\d+_[^*]+)\*\*：(.+)$/);
  if (category && sectionStatus) {
    currentIndustry = category[1].replace(/^\d+_/, '');
    splitNames(category[2]).forEach((name) => upsert(name, { status: sectionStatus, authoritative: true, industries: [currentIndustry], sources: [mainName] }));
    continue;
  }
  const single = line.match(/^- \*\*([^*]+)\*\*：/);
  if (single && sectionStatus && ['观察', '风险', '移出'].includes(sectionStatus)) {
    upsert(single[1], { status: sectionStatus, authoritative: true, industries: currentIndustry ? [currentIndustry] : [], sources: [mainName] });
  }
}

// A prior exclusion for consulting / financial services is a preference rule,
// not a data deletion rule.  The user chose to restore these as normal
// candidates, so retain provenance but promote them to the monitoring pool.
for (const record of records.values()) {
  if (record.status === '移出' && /德勤|安永|斐意特|天职国际|致同|银行|证券|保险/.test(record.name)) {
    record.status = '观察';
    record.restoredCandidate = true;
  }
}

// City supplement tables add geographic coverage and an evidence hint. They
// never turn a company into a verified job by themselves.
for (const name of files.filter((file) => /上海及周边|北京外资|深圳外资|广州及杭州/.test(file))) {
  for (const line of fs.readFileSync(path.join(inputDir, name), 'utf8').split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|[- :|]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*|🔴|✅|❌/g, '').trim());
    if (cells.length < 4 || /^(公司|排序|主要产业|主流岗位)/.test(cells[0])) continue;
    const company = cleanName(cells[0]);
    // Ranked recommendation tables use the first cell for an ordinal rather
    // than a company. They are summaries, not company-source rows.
    if (!company || company.length > 40 || /^[0-9\u20e3\uFE0F\u2460-\u2473]+$/.test(company) || /^(最高优先|主投池|工作机会|英语友好岗|城市|维度|27届校招)/.test(company)) continue;
    const city = cells[3] || '';
    const tracks = (cells[4] || '').split(/[\/、，,]/).map((item) => item.trim()).filter(Boolean);
    const active = cells.some((cell) => /已启动|在招|网申|招聘中/.test(cell));
    upsert(company, { status: active ? '主投' : '观察', cities: city ? [city] : [], targetTracks: tracks, sources: [name] });
  }
}

// The active-opportunity board is job-level evidence only.  It supplies a
// count and sampled role/city, without placing unverified job rows in liveJobs.
for (const line of fs.readFileSync(path.join(inputDir, opportunitiesName), 'utf8').split(/\r?\n/)) {
  if (!/^\|/.test(line) || /^\|[- :|]+\|$/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*|—/g, '').trim());
  if (cells.length < 8 || /^(目录|公司)/.test(cells[0])) continue;
  const company = cleanName(cells[1]);
  if (!company || company.length > 40) continue;
  const key = canonical(company);
  const evidence = opportunityEvidence.get(key) || { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] };
  evidence.count += 1;
  for (const [field, value, limit] of [['roles', cells[3], 5], ['cities', cells[4], 4], ['statuses', cells[7], 3], ['nextSteps', cells[9], 3]]) {
    if (value && !evidence[field].includes(value) && evidence[field].length < limit) evidence[field].push(value);
  }
  opportunityEvidence.set(key, evidence);
  upsert(company, { status: /已启动|网申|招聘中/.test(cells[7] || '') ? '主投' : '观察', sources: [opportunitiesName] });
}

const companies = [...records.values()].map((record) => {
  const evidence = opportunityEvidence.get(canonical(record.name));
  return {
    ...record,
    evidence: evidence || { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] },
    analysis: record.status === '主投'
      ? '已进入主投池；公司层状态不代替岗位核验，优先查看已关联的真实岗位或机会证据。'
      : record.status === '风险'
        ? '保留为风险观察；投递前需单独核验招聘稳定性与岗位真实性。'
        : '纳入候选监测；有真实岗位后再按个人画像参与岗位排序。'
  };
}).sort((a, b) => (statusRank[b.status] - statusRank[a.status]) || a.name.localeCompare(b.name, 'zh-CN'));

const sourceSummary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sourceFiles: files,
  counts: Object.fromEntries(['主投', '观察', '风险', '移出'].map((status) => [status, companies.filter((item) => item.status === status).length]))
};
// Keep the browser payload compact. Provenance remains in the source lists;
// the UI needs only decision fields and the count of job-level evidence.
const browserCompanies = companies.map(({ name, status, restoredCandidate, industries, cities, targetTracks, evidence }) => ({
  name, status, ...(restoredCandidate ? { restoredCandidate: true } : {}),
  industries: industries.slice(0, 2), cities: cities.slice(0, 3), targetTracks: targetTracks.slice(0, 5),
  evidence: { count: evidence.count }
}));
const output = `// AUTO-GENERATED by scripts/import-company-library.mjs.\nexport const companyLibrary = ${JSON.stringify(browserCompanies)};\n\nexport const companyLibraryMeta = ${JSON.stringify(sourceSummary)};\n`;
fs.writeFileSync(new URL('../src/data/company-library.js', import.meta.url), output);
console.log(`Imported ${companies.length} companies.`, sourceSummary.counts);
