import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { companyRecruitment } from '../src/data/company-recruitment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const outRoot = path.join(root, 'jobs');
const companyDir = path.join(outRoot, 'by-company');
const indexDir = path.join(outRoot, 'index');

// 公司校招招聘流程/笔试测评情报（src/data/company-recruitment.js，90家，检索日期2026-09-17）。
// Query Layer 把公司级情报合并进每家公司的每个岗位，供 CareerPilot / campus-job-board 等下游消费。
function normalizeCompanyKey(value = '') {
  const head = String(value || '').split(/[（(]/)[0].trim();
  return head.toLowerCase().normalize('NFKC')
    .replace(/(?:股份有限公司|有限责任公司|股份|有限|集团|公司|控股)$/g, '')
    .replace(/\s+/g, '');
}

// 个别公司名在查询层与研究名不一致时的显式映射：查询层名（归一化后）-> 研究名（归一化后）。
const COMPANY_ALIASES = new Map([['4399游戏', '4399']]);

const recruitmentByCompany = new Map();
for (const item of companyRecruitment || []) {
  if (!item?.company) continue;
  recruitmentByCompany.set(normalizeCompanyKey(item.company), item);
}
for (const [alias, target] of COMPANY_ALIASES) {
  const item = recruitmentByCompany.get(target);
  if (item) recruitmentByCompany.set(alias, item);
}

function formatSource(source) {
  if (!source) return '';
  return [source.level, source.name, source.url, source.retrievalDate].filter(Boolean).join(' | ');
}

// 笔试/测评短值契约：'有' / '无' / '待核实'；未调研到则留空（下游显示「未披露」）。
function normalizeAssessment(text = '') {
  const t = String(text || '').trim();
  if (!t) return '';
  if (/^有/.test(t)) return '有';
  if (/^无/.test(t)) return '无';
  if (/待核实|待确认/.test(t)) return '待核实';
  return t.slice(0, 20);
}

function applyCompanyRecruitment(queryJob) {
  const item = recruitmentByCompany.get(normalizeCompanyKey(queryJob.company));
  if (!item) return;
  if (item.recruitmentProcess) queryJob.recruitmentProcess = String(item.recruitmentProcess);
  if (item.processSource) queryJob.recruitmentProcessEvidence = formatSource(item.processSource);
  const assessment = normalizeAssessment(item.writtenTest);
  if (assessment) queryJob.hasAssessment = assessment;
  if (item.testSource) queryJob.hasAssessmentEvidence = formatSource(item.testSource);
}

export function slugifyCompany(value = '') {
  return String(value).trim().toLowerCase()
    .normalize('NFKC')
    .replace(/(?:股份|有限责任|有限公司|集团|公司)$/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function isCategoryHeadingCompany(value = '') {
  const text = String(value || '').normalize('NFKC').replace(/\s+/g, '').trim();
  return /^\d+[.、．-]?(?:研发|制造|营销|职能|事业|服务|金融|技术|生产|销售|管理|水平事业)(?:类)?单位$/u.test(text);
}

function textOf(job) {
  return [
    job.title,
    job.jobDescription,
    job.jobRequirements,
    job.description,
    job.requirements,
    job.jd,
    job.major,
    job.education,
    job.degree,
    ...(Array.isArray(job.skills) ? job.skills : []),
    ...(Array.isArray(job.languages) ? job.languages : [])
  ].filter(Boolean).join('\n');
}

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueTextParts(parts = []) {
  const out = [];
  const normalized = [];
  for (const raw of parts) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const norm = compact(text);
    if (!norm) continue;
    if (normalized.some((x) => x === norm || x.includes(norm) || norm.includes(x))) continue;
    normalized.push(norm);
    out.push(text);
  }
  return out;
}

function fullJdOf(job) {
  const description = String(job.jobDescription || job.description || job.jd || '').trim();
  const requirements = String(job.jobRequirements || job.requirements || '').trim();
  const parts = uniqueTextParts([description, requirements]);
  return {
    jobDescription: description,
    jobRequirements: requirements,
    JD: parts.join('\n')
  };
}

function normalizeGraduationYear(job, text) {
  const raw = job.graduationYear ?? job.graduationYears ?? '';
  const years = new Set(String(Array.isArray(raw) ? raw.join(' ') : raw).match(/20\d{2}/g) || []);
  for (const y of String(text).match(/20\d{2}(?=届|年)/g) || []) years.add(y);
  return [...years].sort();
}

function normalizeEducation(job, text) {
  const raw = String(job.education ?? job.degree ?? job.educationRequirement ?? '').trim();
  const t = `${raw}\n${text}`;
  const masterRequired = /(?:硕士|研究生)(?:学历|学位)?(?:及以上|以上|起)|仅限(?:硕士|研究生)|必须(?:为|是)?(?:硕士|研究生)/.test(t)
    && !/(?:本科|学士)(?:及以上|以上)/.test(t);
  let min = '';
  if (/(?:大专|专科)(?:及以上|以上)/.test(t)) min = '大专';
  else if (/(?:本科|学士)(?:及以上|以上)|本科生|本科学历/.test(t)) min = '本科';
  else if (/(?:硕士|研究生)(?:及以上|以上)|硕士生|研究生学历/.test(t)) min = '硕士';
  else if (/(?:博士)(?:及以上|以上)|博士生|博士学历/.test(t)) min = '博士';
  return { raw, min, masterRequired };
}

function normalizeMajor(job) {
  const evidence = job?.jdEvidence && Array.isArray(job.jdEvidence.majorClauses)
    ? job.jdEvidence.majorClauses.filter(Boolean).join('；')
    : '';
  const raw = String(job.major ?? job.majors ?? job.majorRequirement ?? evidence ?? '').trim();
  const openRx = /专业不限|不限专业|不限学科|专业不作限制|无专业限制|不限制专业/;
  const preferredRx = /优先|优先考虑|加分|更佳|者佳|preferred|prefer/i;
  const majorContextRx = /专业|专业背景|学科|方向|背景|理工科|理工类|工科|工科类|理科|STEM/;
  const clauses = raw.split(/[\n\r。；;！!？?，,]+/).map((x) => x.trim()).filter(Boolean);
  const hardClauses = clauses.filter((clause) => {
    if (!majorContextRx.test(clause)) return false;
    if (openRx.test(clause)) return false;
    // “优先”只软化它所在的原子条件，不能软化前一个逗号前的硬门槛。
    if (preferredRx.test(clause)) return false;
    return true;
  });
  return { raw, hardRestriction: hardClauses.length > 0, hardClauses };
}

function normalizeLanguage(job, text) {
  const raw = Array.isArray(job.languages) ? job.languages.join('、') : String(job.language ?? job.languages ?? '');
  const t = `${raw}\n${text}`;
  const english = /英语|英文|CET[- ]?[46]|TEM[- ]?[48]|IELTS|TOEFL/i.test(t);
  const minorLanguages = ['日语', '韩语', '德语', '法语', '西班牙语', '葡萄牙语', '俄语', '阿拉伯语', '意大利语', '泰语', '越南语', '印尼语', '马来语'];
  const hardRequirement = '(?:必须|必需|要求|需|熟练|流利|精通|工作语言)';
  const clauses = t.split(/[\n。；;，,]+/).map((item) => item.trim()).filter(Boolean);

  let minorLanguageRequired = false;
  for (const language of minorLanguages) {
    for (const clause of clauses) {
      if (!clause.includes(language)) continue;
      const requiredPattern = new RegExp(`(?:${hardRequirement}.{0,12}${language}|${language}.{0,12}${hardRequirement})`);
      if (!requiredPattern.test(clause)) continue;

      const preferredOnly = new RegExp(`${language}.{0,12}(?:优先|加分|preferred)`, 'i');
      if (preferredOnly.test(clause)) continue;

      const explicitMust = new RegExp(`(?:(?:必须|必需).{0,6}${language}|${language}.{0,6}(?:必须|必需))`).test(clause);
      const directEnglishAlternative = new RegExp(`(?:(?:英语|英文).{0,6}(?:或|\\/).{0,6}${language}|${language}.{0,6}(?:或|\\/).{0,6}(?:英语|英文))`).test(clause);
      const englishAnyOfList = /英语|英文/.test(clause)
        && /(?:任一|任选(?:其一)?|之一|均可)/.test(clause)
        && clause.includes(language);
      if (!explicitMust && (directEnglishAlternative || englishAnyOfList)) continue;

      minorLanguageRequired = true;
      break;
    }
    if (minorLanguageRequired) break;
  }
  return { raw, english, minorLanguageRequired };
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function toQueryJob(job) {
  const text = textOf(job);
  const jd = fullJdOf(job);
  const sourceUrl = job.officialURL || job.officialUrl || job.applyUrl || job.sourceUrl || job.url || '';
  return {
    id: job.id || '',
    company: job.company || '',
    title: job.title || '',
    graduationYear: normalizeGraduationYear(job, text),
    education: normalizeEducation(job, text),
    major: normalizeMajor(job),
    language: normalizeLanguage(job, text),
    location: job.location || job.city || job.locations || '',

    // Query Layer必须保留完整JD两段，不能再用 description || requirements 丢掉半份JD。
    jobDescription: jd.jobDescription,
    jobRequirements: jd.jobRequirements,
    JD: jd.JD,

    // 只透传AI_Job的事实证据；不包含任何候选人匹配结论。
    jdEvidence: safeObject(job.jdEvidence),
    roleFamily: safeArray(job.roleFamily),
    skills: safeArray(job.skills),
    experienceKeywords: safeArray(job.experienceKeywords),
    preferenceTags: safeArray(job.preferenceTags),
    riskTags: safeArray(job.riskTags),

    // 结构化事实一并保留，供下游做真实Offer可达性/信息可信度判断。
    headcount: safeObject(job.headcount),
    compensation: safeObject(job.compensation),
    salary: job.salary || '',
    monthlySalary: job.monthlySalary || '',
    annualSalary: job.annualSalary || '',

    source: job.source || job.sourceType || '',
    officialURL: sourceUrl,
    publishedAt: job.publishedAt || job.publishDate || '',
    lastVerified: job.lastVerified || job.verifiedAt || '',
    sourceType: job.sourceType || '',
    deadline: job.deadline || ''
  };
}

function toCareerPilotFeedJob(job = {}) {
  return {
    id: job.id || '',
    company: job.company || '',
    title: job.title || '',
    graduationYear: safeArray(job.graduationYear),
    education: safeObject(job.education),
    major: safeObject(job.major),
    language: safeObject(job.language),
    location: job.location || '',
    roleFamily: safeArray(job.roleFamily),
    skills: safeArray(job.skills),
    source: job.source || '',
    sourceType: job.sourceType || '',
    officialURL: job.officialURL || '',
    publishedAt: job.publishedAt || '',
    lastVerified: job.lastVerified || '',
    deadline: job.deadline || ''
  };
}

export async function buildQueryLayer(jobs, { updatedAt = new Date().toISOString(), outputRoot = outRoot } = {}) {
  const byCompany = new Map();
  const queryJobs = [];
  for (const job of jobs || []) {
    if (!job?.company || !job?.title || isCategoryHeadingCompany(job.company)) continue;
    const key = String(job.company).trim();
    const queryJob = toQueryJob(job);
    applyCompanyRecruitment(queryJob);
    queryJobs.push(queryJob);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(queryJob);
  }

  const outCompanyDir = path.join(outputRoot, 'by-company');
  const outIndexDir = path.join(outputRoot, 'index');
  await fs.rm(outCompanyDir, { recursive: true, force: true });
  await fs.mkdir(outCompanyDir, { recursive: true });
  await fs.mkdir(outIndexDir, { recursive: true });

  const companies = [];
  const used = new Set();
  for (const [company, companyJobs] of [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    let slug = slugifyCompany(company);
    if (used.has(slug)) {
      let i = 2;
      while (used.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    used.add(slug);
    const file = `${slug}.json`;
    const payload = { company, count: companyJobs.length, updatedAt, jobs: companyJobs };
    await fs.writeFile(path.join(outCompanyDir, file), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    companies.push({ company, slug, file: `jobs/by-company/${file}`, count: companyJobs.length });
  }

  const manifest = {
    schemaVersion: 1,
    updatedAt,
    totalJobs: queryJobs.length,
    totalCompanies: companies.length,
    companies
  };
  const aggregate = {
    schemaVersion: 1,
    updatedAt,
    totalJobs: queryJobs.length,
    jobs: queryJobs
  };
  const careerPilotFeed = {
    schemaVersion: 1,
    purpose: 'careerpilot-fact-feed',
    updatedAt,
    totalJobs: queryJobs.length,
    jobs: queryJobs.map(toCareerPilotFeedJob)
  };
  await fs.writeFile(path.join(outIndexDir, 'companies.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outIndexDir, 'jobs.json'), `${JSON.stringify(aggregate)}\n`, 'utf8');
  await fs.writeFile(path.join(outIndexDir, 'careerpilot-feed.json'), `${JSON.stringify(careerPilotFeed)}\n`, 'utf8');
  return manifest;
}

// 给 live-jobs.js 岗位回写公司级招聘流程/笔试测评情报（与 Query Layer 同一份 company-recruitment 数据源）。
// CareerPilot 等下游仍直接消费 src/data/live-jobs.js（而非 jobs.json），因此必须让两个发布产物都携带该情报。
function enrichLiveJob(job) {
  const item = recruitmentByCompany.get(normalizeCompanyKey(job.company));
  if (!item) return job;
  const out = { ...job };
  if (item.recruitmentProcess && !out.recruitmentProcess) {
    out.recruitmentProcess = String(item.recruitmentProcess);
  }
  if (item.processSource && !out.recruitmentProcessEvidence) {
    out.recruitmentProcessEvidence = formatSource(item.processSource);
  }
  const assessment = normalizeAssessment(item.writtenTest);
  if (assessment && !out.hasAssessment) {
    out.hasAssessment = assessment;
  }
  if (item.testSource && !out.hasAssessmentEvidence) {
    out.hasAssessmentEvidence = formatSource(item.testSource);
  }
  return out;
}

async function main() {
  const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const jobs = mod.liveJobs || mod.default || [];
  const updatedAt = mod.discoveryMeta?.updatedAt || new Date().toISOString();
  const manifest = await buildQueryLayer(jobs, { updatedAt });
  console.log(`[query-layer] DONE jobs=${manifest.totalJobs} companies=${manifest.totalCompanies}`);
  // 回写 live-jobs.js：保持模块格式与 discoveryMeta，仅追加公司级招聘情报字段。
  const enriched = jobs.map(enrichLiveJob);
  const metaJson = JSON.stringify(mod.discoveryMeta || {}, null, 2);
  const moduleText = `// AUTO-GENERATED by job discovery refresh + language/compensation enrichment + company-recruitment enrichment.\nexport const liveJobs = ${JSON.stringify(enriched)};\n\nexport const discoveryMeta = ${metaJson};\n`;
  await fs.writeFile(livePath, moduleText, 'utf8');
  console.log(`[query-layer] live-jobs.js enriched=${enriched.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();