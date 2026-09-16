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

export function isCategoryHeadingCompany(value = '') {
  const text = String(value || '').normalize('NFKC').replace(/\s+/g, '').trim();
  return /^\d+[.、．-]?(?:研发|制造|营销|职能|事业|服务|金融|技术|生产|销售|管理|水平事业)(?:类)?单位$/u.test(text);
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

function normalizeMajor(job) {
  const raw = String(job.major ?? job.majors ?? job.majorRequirement ?? '').trim();
  const open = /专业不限|不限专业|不限学科|专业不作限制/.test(raw);
  const preferred = /(?:专业|专业背景|学科|方向).{0,12}(?:优先|优先考虑)|(?:优先|优先考虑)\s*$/.test(raw);
  return { raw, hardRestriction: Boolean(raw && !open && !preferred) };
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

export function toQueryJob(job) {
  const text = textOf(job);
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
  const queryJobs = [];
  for (const job of jobs || []) {
    if (!job?.company || !job?.title || isCategoryHeadingCompany(job.company)) continue;
    const key = String(job.company).trim();
    const queryJob = toQueryJob(job);
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
  await fs.writeFile(path.join(outIndexDir, 'companies.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outIndexDir, 'jobs.json'), `${JSON.stringify(aggregate)}\n`, 'utf8');
  return manifest;
}

async function main() {
  const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const jobs = mod.liveJobs || mod.default || [];
  const updatedAt = mod.discoveryMeta?.updatedAt || new Date().toISOString();
  const manifest = await buildQueryLayer(jobs, { updatedAt });
  console.log(`[query-layer] DONE jobs=${manifest.totalJobs} companies=${manifest.totalCompanies}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();