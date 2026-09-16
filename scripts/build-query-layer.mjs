import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const outRoot = path.join(root, 'jobs');
const companyDir = path.join(outRoot, 'by-company');
const indexDir = path.join(outRoot, 'index');

export function slugifyCompany(value = '') {
  return String(value).trim().toLowerCase()
    .normalize('NFKC')
    .replace(/(?:股份|有限责任|有限公司|集团|公司)$/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function textOf(job) {
  return [job.title, job.description, job.requirements, job.major, job.education, job.degree,
    ...(Array.isArray(job.skills) ? job.skills : []), ...(Array.isArray(job.languages) ? job.languages : [])]
    .filter(Boolean).join('\n');
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
  else if (/(?:博士)(?:及以上|以上)|博士生/.test(t)) min = '博士';
  return { raw, min, masterRequired };
}

function normalizeMajor(job, text) {
  const raw = String(job.major ?? job.majors ?? job.majorRequirement ?? '').trim();
  const t = `${raw}\n${text}`;
  const open = /专业不限|不限专业|不限学科|专业不作限制/.test(t);
  const preferred = /优先|相关专业/.test(t);
  return { raw, hardRestriction: Boolean(raw && !open && !preferred) };
}

function normalizeLanguage(job, text) {
  const raw = Array.isArray(job.languages) ? job.languages.join('、') : String(job.language ?? job.languages ?? '');
  const t = `${raw}\n${text}`;
  const english = /英语|英文|CET[- ]?[46]|TEM[- ]?[48]|IELTS|TOEFL/i.test(t);
  const minorLanguageRequired = /(?:日语|韩语|德语|法语|西班牙语|葡萄牙语|俄语|阿拉伯语|意大利语|泰语|越南语|印尼语|马来语).{0,12}(?:必须|必需|要求|熟练|流利|工作语言)/.test(t)
    && !/(?:小语种|第二外语).{0,10}(?:优先|加分)/.test(t);
  return { raw, english, minorLanguageRequired };
}

export function toQueryJob(job) {
  const text = textOf(job);
  const sourceUrl = job.officialURL || job.officialUrl || job.applyUrl || job.sourceUrl || job.url || '';
  return {
    id: job.id || '',
    company: job.company || '',
    title: job.title || '',
    graduationYear: normalizeGraduationYear(job, text),
    education: normalizeEducation(job, text),
    major: normalizeMajor(job, text),
    language: normalizeLanguage(job, text),
    location: job.location || job.city || job.locations || '',
    JD: job.description || job.jd || job.requirements || '',
    source: job.source || job.sourceType || '',
    officialURL: sourceUrl,
    lastVerified: job.lastVerified || job.verifiedAt || job.publishedAt || '',
    sourceType: job.sourceType || '',
    deadline: job.deadline || ''
  };
}

export async function buildQueryLayer(jobs, { updatedAt = new Date().toISOString(), outputRoot = outRoot } = {}) {
  const byCompany = new Map();
  for (const job of jobs || []) {
    if (!job?.company || !job?.title) continue;
    const key = String(job.company).trim();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(toQueryJob(job));
  }

  const companyOutput = path.join(outputRoot, 'by-company');
  const indexOutput = path.join(outputRoot, 'index');
  await fs.rm(companyOutput, { recursive: true, force: true });
  await fs.mkdir(companyOutput, { recursive: true });
  await fs.mkdir(indexOutput, { recursive: true });

  const used = new Set();
  const companies = [];
  for (const [company, companyJobs] of [...byCompany].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))) {
    let slug = slugifyCompany(company);
    if (used.has(slug)) {
      let n = 2;
      while (used.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    used.add(slug);
    const payload = { schemaVersion: 1, company, updatedAt, count: companyJobs.length, jobs: companyJobs };
    await fs.writeFile(path.join(companyOutput, `${slug}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    companies.push({ company, slug, count: companyJobs.length, path: `jobs/by-company/${slug}.json` });
  }

  const manifest = { schemaVersion: 1, updatedAt, totalJobs: jobs.length, totalCompanies: companies.length, companies };
  await fs.writeFile(path.join(indexOutput, 'companies.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function main() {
  const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const jobs = Array.isArray(mod.liveJobs) ? mod.liveJobs : [];
  const updatedAt = mod.discoveryMeta?.updatedAt || new Date().toISOString();
  const manifest = await buildQueryLayer(jobs, { updatedAt });
  console.log(`[query-layer] DONE jobs=${manifest.totalJobs} companies=${manifest.totalCompanies}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
