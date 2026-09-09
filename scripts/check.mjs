import fs from 'node:fs';
import path from 'node:path';
import { demoJobs } from '../src/data/jobs.js';
import { liveJobs } from '../src/data/live-jobs.js';
import { companyRegistry, isValidCompanyRecord } from '../src/data/company-registry.js';
import { sourceRegistry } from '../src/data/source-registry.js';
import { companyRequests } from '../src/data/company-requests.js';

const root = path.resolve(process.cwd());
const required = [
  'index.html', 'src/bootstrap.js', 'src/app.js', 'src/styles.css', 'src/discovery.css', 'src/core/matcher.js',
  'src/core/shortlist.js', 'src/core/company-intake.js', 'src/core/storage.js', 'src/data/jobs.js', 'src/data/live-jobs.js', 'src/data/profile.js',
  'src/data/company-library.js', 'src/data/company-registry.js', 'src/data/company-requests.js', 'src/data/source-registry.js',
  'scripts/job-discovery/core.mjs', 'scripts/job-discovery/nowcoder.mjs', 'scripts/job-discovery/moka.mjs',
  'scripts/job-discovery/beisen.mjs', 'scripts/job-discovery/feishu.mjs', 'scripts/job-discovery/hotjob.mjs',
  'scripts/job-discovery/anker.mjs', 'scripts/job-discovery/ecoflow.mjs', 'scripts/refresh-jobs.mjs',
  'scripts/import-company-library.mjs', 'scripts/build-source-registry.mjs', 'scripts/build-company-requests.mjs',
  'scripts/process-company-intake.mjs', 'config/search-profile.json', 'config/official-sources.json', 'config/company-requests.json',
  '.github/workflows/company-intake.yml', 'README.md', 'docs/PLAN.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing required file: ${file}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('./src/bootstrap.js') || !html.includes('./src/styles.css') || !html.includes('./src/discovery.css')) {
  throw new Error('index.html asset/bootstrap references are incomplete');
}

const allJobs = [...demoJobs, ...liveJobs];
const ids = allJobs.map((job) => job.id);
if (new Set(ids).size !== ids.length) throw new Error('duplicate job ids detected');
if (allJobs.some((job) => !job.company || !job.title || !job.roleFamily?.length)) throw new Error('job schema validation failed');
if (liveJobs.some((job) => job.graduationYear !== '2027' || !job.sourceUrl || !job.verification)) {
  throw new Error('live job provenance/cohort validation failed');
}

const config = JSON.parse(fs.readFileSync(path.join(root, 'config/search-profile.json'), 'utf8'));
if (config.graduationYear !== '2027' || !config.roleKeywords?.length || !config.keywords?.length) {
  throw new Error('search profile validation failed');
}

const requestConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/company-requests.json'), 'utf8'));
if (!Array.isArray(requestConfig)) throw new Error('company request queue must be an array');
if (JSON.stringify(requestConfig) !== JSON.stringify(companyRequests)) {
  throw new Error('company-requests.js is stale; run npm run build:company-requests');
}
if (companyRequests.some((request) => !request?.name || !request?.status || !request?.requestedAt)) {
  throw new Error('company request schema validation failed');
}

const sources = JSON.parse(fs.readFileSync(path.join(root, 'config/official-sources.json'), 'utf8'));
if (!Array.isArray(sources.moka) || !sources.moka.length) throw new Error('official Moka source registry is empty');
if (sources.moka.some((s) => !s.company || !/^https:\/\/app\.mokahr\.com\//.test(s.url) || s.graduationYear !== '2027')) {
  throw new Error('official Moka source registry validation failed');
}
if (!Array.isArray(sources.beisen) || !sources.beisen.length) throw new Error('official Beisen source registry is empty');
if (sources.beisen.some((s) => {
  const validHost = /^https:\/\/[a-z0-9.-]+\.zhiye\.com$/i.test(s.baseUrl) || s.baseUrl === 'https://hr-campus.vivo.com';
  const validMode = !s.mode || s.mode === 'html';
  return !s.company || !validHost || !validMode || s.graduationYear !== '2027';
})) {
  throw new Error('official Beisen source registry validation failed');
}
const vivo = sources.beisen.find((s) => s.company === 'vivo');
if (vivo && !vivo.portalId) throw new Error('vivo Beisen campus PortalId is required');

if (!Array.isArray(sources.feishu) || !sources.feishu.length) throw new Error('official Feishu source registry is empty');
if (sources.feishu.some((s) => {
  const validHost = /^https:\/\/[a-z0-9.-]+\.jobs\.feishu\.cn$/i.test(s.baseUrl);
  const validPath = /^[A-Za-z0-9_/-]{1,80}$/.test(s.websitePath || '');
  const validDetail = !s.detailTemplate || /^https:\/\/[a-z0-9.-]+\.jobs\.feishu\.cn\/.+\{id\}.+$/i.test(s.detailTemplate);
  const validCohort = s.graduationYear === '2027' && !s.cohortMode;
  return !s.company || !validHost || !validPath || !validDetail || !validCohort || Number(s.maxJobs || 0) < 10 || Number(s.maxPages || 0) < 1;
})) {
  throw new Error('official generic Feishu source registry validation failed');
}

if (!Array.isArray(sources.hotjob) || !sources.hotjob.length) throw new Error('official HotJob source registry is empty');
if (sources.hotjob.some((s) => {
  const validHost = s.baseUrl === 'https://wecruit.hotjob.cn';
  const validTenant = /^[a-f0-9]{24}$/i.test(s.tenant || '');
  const validUrl = new RegExp(`^https://wecruit\\.hotjob\\.cn/SU${s.tenant}/pb/school\\.html`).test(s.url || '');
  return !s.company || !validHost || !validTenant || !validUrl || s.graduationYear !== '2027' || Number(s.maxPages || 0) < 1 || Number(s.maxDetails || 0) < 1;
})) {
  throw new Error('official HotJob source registry validation failed');
}

const anker = sources.anker;
if (!anker || anker.company !== '安克创新' || anker.url !== 'https://career.anker-in.com/universities/recruitment/' || anker.apiBase !== 'https://rainbowbridge.anker.com' || !anker.websiteId || anker.graduationYear !== '2027' || Number(anker.maxJobs) < 10 || Number(anker.maxPages) < 1) {
  throw new Error('official Anker source registry validation failed');
}
const ecoflow = sources.ecoflow;
if (!ecoflow || ecoflow.company !== '正浩创新EcoFlow' || !/^https:\/\/jobs\.ecoflow\.com\/602892/.test(ecoflow.url) || ecoflow.apiBase !== 'https://jobs.ecoflow.com' || ecoflow.websitePath !== '602892' || Number(ecoflow.portalType) !== 6 || ecoflow.graduationYear !== '2027' || Number(ecoflow.maxJobs) < 10 || Number(ecoflow.maxPages) < 1) {
  throw new Error('official EcoFlow Feishu API registry validation failed');
}

const flattenedSources = Object.entries(sources).flatMap(([provider, value]) => (Array.isArray(value) ? value : value ? [value] : []).map((item) => ({ provider, company: item.company })));
if (JSON.stringify(flattenedSources) !== JSON.stringify(sourceRegistry)) {
  throw new Error('source-registry.js is stale; run npm run build:source-registry');
}
if (companyRegistry.some((record) => !isValidCompanyRecord(record))) throw new Error('invalid company row in unified company registry');
if (companyRegistry.some((record) => record.status !== '主投' && (record.industries || []).length)) throw new Error('non-main company has leaked industry label');
if (companyRegistry.some((record) => (record.cities || []).some((value) => /市场|营销|HR|运营|商务|供应链|客户|产品/i.test(value)))) {
  throw new Error('company cities contains target-track data');
}
const missingRequests = companyRequests.filter((request) => !companyRegistry.some((record) => record.userRequested && (() => {
  const clean = (value) => String(value || '').replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '').replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '').toLowerCase();
  const a = clean(record.name); const b = clean(request.name);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
})()));
if (missingRequests.length) throw new Error(`company requests missing from registry: ${missingRequests.map((x) => x.name).join(', ')}`);
const missingManaged = sourceRegistry.filter((source) => !companyRegistry.some((record) => record.sourceManaged && record.sourceProviders?.includes(source.provider) && (() => {
  const clean = (value) => String(value || '').replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '').replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '').toLowerCase();
  const a = clean(record.name); const b = clean(source.company);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
})()));
if (missingManaged.length) throw new Error(`official sources missing from company registry: ${missingManaged.map((x) => `${x.provider}:${x.company}`).join(', ')}`);

console.log(`Static checks passed: ${required.length} files, ${demoJobs.length} demo jobs, ${liveJobs.length} live jobs, ${companyRegistry.length} unified companies, ${sourceRegistry.length} official source links, ${companyRequests.length} company intake requests, provenance and registry quality OK.`);
