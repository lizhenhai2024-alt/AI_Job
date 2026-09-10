#!/usr/bin/env node
/**
 * Imports maintained Markdown company lists into the browser-side company library.
 * The four-pool master list is authoritative. Supplemental files may add location,
 * target-track and opportunity evidence, but may not invent industries or companies.
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

const CITY_NAMES = ['北京','上海','广州','深圳','杭州','苏州','无锡','长沙','武汉','西安','成都','天津','南京','佛山','东莞','珠海','惠州','厦门','济南','青岛','昆明','长春','宁波','合肥','郑州','重庆','大连','沈阳','福州','南昌','南宁'];
const CITY_SET = new Set(CITY_NAMES);
const NON_COMPANY_LABELS = /^(公司|排序|城市|维度|最高优先|高优先|次优先|主投池|观察池|风险观察|移出主投池|工作机会|英语友好岗|27届校招|主要产业|主流岗位|品牌终端|整车|零部件|其他|大型|垂直|综合|出海|快递|工业|动力|光伏|输变电|游戏|内容|网络|数据|晶圆|半导体|机器人|核心|医疗|酒水|农牧)$/;
// 金融相关公司（银行/券商/审计/咨询）默认不新增为主投池（用户硬约束）；四大所按品牌名匹配；保险类仅当用户机会清单显式保留时放行。
const FINANCIAL_RX = /银行|证券|审计|咨询|会计|资管|信托|普华永道|毕马威|安永|德勤/;
const TRACK_HINT = /(市场|营销|品牌|运营|商务|客户|HR|人力|供应链|采购|财务|咨询|审计|法务|销售支持|客户成功|产品|项目管理|国际业务|跨境|电商)/i;

export const cleanCompanyName = (value = '') => String(value)
  .replace(/\[[^\]]+\]\([^)]*\)/g, '')
  .replace(/^[\s🔴🟢🔵✅❌⭐★•·]+/u, '')
  .replace(/\*+/g, '')
  .replace(/[（(].*?[）)]/g, '')
  .replace(/^[\s|]+|[\s|]+$/g, '')
  .trim();

export const canonicalCompanyName = (value = '') => cleanCompanyName(value)
  .replace(/[【\[\]、】【，,、·•：:;；&\s]/g, '')
  .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股/g, '')
  .toLowerCase()
  .trim();

export function isPlausibleCompanyName(value = '') {
  const name = cleanCompanyName(value);
  if (!name || name.length > 40 || CITY_SET.has(name) || NON_COMPANY_LABELS.test(name)) return false;
  if (/^(?:\d+|[0-9️⃣🔟①②③④⑤⑥⑦⑧⑨⑩]+)$/u.test(name)) return false;
  if (/https?:\/\//i.test(name) || /^\[[^\]]+\]\(/.test(name)) return false;
  return /[A-Za-z\u4e00-\u9fff]/u.test(name);
}

export function normalizeCityValues(values = []) {
  const found = [];
  for (const value of values || []) {
    const text = String(value || '');
    for (const city of CITY_NAMES) {
      if (text.includes(city) && !found.includes(city)) found.push(city);
    }
  }
  return found;
}

export function normalizeTrackValues(values = []) {
  const found = [];
  for (const value of values || []) {
    for (const part of String(value || '').split(/[\/、，,]/).map((item) => item.trim()).filter(Boolean)) {
      if (TRACK_HINT.test(part) && !found.includes(part)) found.push(part);
    }
  }
  return found;
}

const splitNames = (value) => String(value)
  .split(/[、，,](?![^()（）]*[)）])/)
  .map((item) => cleanCompanyName(item))
  .filter(isPlausibleCompanyName);

const statusRank = { '主投': 4, '观察': 3, '风险': 2, '移出': 1 };
const records = new Map();
const opportunityEvidence = new Map();

function upsert(rawName, patch = {}) {
  const name = cleanCompanyName(rawName);
  if (!isPlausibleCompanyName(name)) return;
  const key = canonicalCompanyName(name);
  if (!key) return;
  const existing = records.get(key) || {
    id: `company-${key.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 48)}`,
    name, aliases: [], statuses: [], industries: [], cities: [], targetTracks: [], sources: []
  };
  if (patch.status && (patch.authoritative || !existing.status)) existing.status = patch.status;
  for (const field of ['aliases', 'industries', 'cities', 'targetTracks', 'sources']) {
    for (const value of patch[field] || []) if (value && !existing[field].includes(value)) existing[field].push(value);
  }
  if (patch.status && !existing.statuses.includes(patch.status)) existing.statuses.push(patch.status);
  records.set(key, existing);
}

// Master list: only numbered category rows carry an industry. Single-company
// rows in observation/risk/excluded sections NEVER inherit the prior category.
let sectionStatus = null;
for (const line of fs.readFileSync(path.join(inputDir, mainName), 'utf8').split(/\r?\n/)) {
  if (/^## 保留主投池/.test(line)) sectionStatus = '主投';
  else if (/^## 观察池/.test(line)) sectionStatus = '观察';
  else if (/^## 风险观察/.test(line)) sectionStatus = '风险';
  else if (/^## 移出主投池/.test(line)) sectionStatus = '移出';
  else if (/^## /.test(line)) sectionStatus = null;

  const category = line.match(/^- \*\*(\d+_[^*]+)\*\*：(.+)$/);
  if (category && sectionStatus) {
    const industry = category[1].replace(/^\d+_/, '');
    splitNames(category[2]).forEach((name) => upsert(name, {
      status: sectionStatus, authoritative: true, industries: [industry], sources: [mainName]
    }));
    continue;
  }
  const single = line.match(/^- \*\*([^*]+)\*\*：/);
  if (single && sectionStatus && ['观察', '风险', '移出'].includes(sectionStatus)) {
    upsert(single[1], { status: sectionStatus, authoritative: true, sources: [mainName] });
  }
}

for (const record of records.values()) {
  if (record.status === '移出' && /德勤|安永|斐意特|天职国际|致同|银行|证券|保险/.test(record.name)) {
    record.status = '观察';
    record.restoredCandidate = true;
  }
}

function parseMarkdownTables(text) {
  const rows = [];
  let header = null;
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|/.test(line)) { header = null; continue; }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*|🔴|✅|❌/gu, '').trim());
    if (!cells.length) continue;
    if (cells.every((cell) => /^[- :]*$/.test(cell))) continue;
    if (cells.includes('公司')) { header = cells; continue; }
    if (!header || cells.length !== header.length) continue;
    rows.push(Object.fromEntries(header.map((key, index) => [key, cells[index]])));
  }
  return rows;
}

// Supplemental files use different table schemas. Only headers explicitly
// meaning location may populate cities. Function/role columns go to targetTracks.
for (const name of files.filter((file) => /上海及周边|北京外资|深圳外资|广州及杭州/.test(file))) {
  const rows = parseMarkdownTables(fs.readFileSync(path.join(inputDir, name), 'utf8'));
  for (const row of rows) {
    const company = cleanCompanyName(row['公司']);
    if (!isPlausibleCompanyName(company)) continue;
    const locationValues = [row['工作城市'], row['工作地点'], row['城市']].filter(Boolean);
    const trackValues = [row['岗位方向'], row['主流岗位'], row['中国区职能']].filter(Boolean);
    const cities = normalizeCityValues(locationValues);
    const tracks = normalizeTrackValues(trackValues);
    const cohort = row['27届校招'] || '';
    const active = /已启动|在招|网申|招聘中/.test(cohort) && !FINANCIAL_RX.test(company);
    upsert(company, { status: active ? '主投' : '观察', cities, targetTracks: tracks, sources: [name] });
  }
}

// Opportunity rows are evidence only; they never become liveJobs by themselves.
for (const line of fs.readFileSync(path.join(inputDir, opportunitiesName), 'utf8').split(/\r?\n/)) {
  if (!/^\|/.test(line) || /^\|[- :|]+\|$/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*|—/g, '').trim());
  if (cells.length < 8 || /^(目录|公司)/.test(cells[0])) continue;
  const company = cleanCompanyName(cells[1]);
  if (!isPlausibleCompanyName(company)) continue;
  const key = canonicalCompanyName(company);
  const evidence = opportunityEvidence.get(key) || { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] };
  evidence.count += 1;
  for (const [field, value, limit] of [['roles', cells[3], 5], ['cities', cells[4], 4], ['statuses', cells[7], 3], ['nextSteps', cells[9], 3]]) {
    if (value && !evidence[field].includes(value) && evidence[field].length < limit) evidence[field].push(value);
  }
  opportunityEvidence.set(key, evidence);
  upsert(company, { status: /已启动|网申|招聘中/.test(cells[7] || '') ? '主投' : '观察', sources: [opportunitiesName] });
}

// Opportunity board is a 12-column superset of the started-opportunities list
// (目录|公司|等级|岗位|城市|Role|P100|Coverage/RFS|优先级|状态|截止|下一步).
// Rows are evidence only; the status column sits at index 9.
const boardName = files.find((name) => name.includes('机会看板_全行业汇总'));
if (boardName) {
  for (const line of fs.readFileSync(path.join(inputDir, boardName), 'utf8').split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|[- :|]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*|—/g, '').trim());
    if (cells.length < 10 || /^(目录|公司|合计)/.test(cells[0])) continue;
    const company = cleanCompanyName(cells[1]);
    if (!isPlausibleCompanyName(company)) continue;
    const key = canonicalCompanyName(company);
    const evidence = opportunityEvidence.get(key) || { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] };
    evidence.count += 1;
    for (const [field, value, limit] of [['roles', cells[3], 5], ['cities', cells[4], 4], ['statuses', cells[9], 3], ['nextSteps', cells[11], 3]]) {
      if (value && !evidence[field].includes(value) && evidence[field].length < limit) evidence[field].push(value);
    }
    opportunityEvidence.set(key, evidence);
    upsert(company, { status: /已启动|网申|招聘中/.test(cells[9] || '') ? '主投' : '观察', sources: [boardName] });
  }
}

const companies = [...records.values()].map((record) => {
  const evidence = opportunityEvidence.get(canonicalCompanyName(record.name));
  return {
    ...record,
    cities: normalizeCityValues(record.cities),
    targetTracks: normalizeTrackValues(record.targetTracks),
    evidence: evidence || { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] }
  };
}).sort((a, b) => (statusRank[b.status] - statusRank[a.status]) || a.name.localeCompare(b.name, 'zh-CN'));

const badNames = companies.filter((company) => !isPlausibleCompanyName(company.name));
if (badNames.length) throw new Error(`Invalid company rows after import: ${badNames.map((item) => item.name).join(', ')}`);
const pollutedIndustries = companies.filter((company) => company.status !== '主投' && company.industries.length);
if (pollutedIndustries.length) throw new Error(`Non-authoritative industry leakage: ${pollutedIndustries.map((item) => item.name).join(', ')}`);
const pollutedCities = companies.filter((company) => (company.cities || []).some((city) => !CITY_SET.has(city)));
if (pollutedCities.length) throw new Error(`Non-city values detected in cities: ${pollutedCities.map((item) => item.name).join(', ')}`);

const sourceSummary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sourceFiles: files,
  counts: Object.fromEntries(['主投', '观察', '风险', '移出'].map((status) => [status, companies.filter((item) => item.status === status).length]))
};
const browserCompanies = companies.map(({ name, status, restoredCandidate, industries, cities, targetTracks, evidence }) => ({
  name, status, ...(restoredCandidate ? { restoredCandidate: true } : {}),
  industries: industries.slice(0, 2), cities: cities.slice(0, 6), targetTracks: targetTracks.slice(0, 6),
  evidence: { count: evidence.count }
}));
const output = `// AUTO-GENERATED by scripts/import-company-library.mjs.\nexport const companyLibrary = ${JSON.stringify(browserCompanies)};\n\nexport const companyLibraryMeta = ${JSON.stringify(sourceSummary)};\n`;
fs.writeFileSync(new URL('../src/data/company-library.js', import.meta.url), output);
console.log(`Imported ${companies.length} companies.`, sourceSummary.counts);
