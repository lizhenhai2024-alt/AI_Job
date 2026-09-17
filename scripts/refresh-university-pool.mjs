#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchUniversityJobs } from './job-discovery/university.mjs';
import { curateDiscoveredJobs } from './job-discovery/granularity.mjs';
import { isOutOfScopeProfessionalRole } from './filter-official-live-jobs.mjs';
import { slugifyCompany, toQueryJob } from './build-query-layer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'config/search-profile.json');
const configPath = path.join(root, 'config/university-sources.json');
const indexDir = path.join(root, 'jobs', 'index');
const byUniversityDir = path.join(root, 'jobs', 'by-university');

export const ELITE_SEGMENTS = ['985', '211', '双一流'];
export const SPECIALTY_SEGMENTS = ['外语外贸特色高校'];

function envInt(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function intersects(values = [], wanted = []) {
  const set = new Set(values || []);
  return wanted.some((x) => set.has(x));
}

export function universityPoolType(source = {}) {
  const segments = Array.isArray(source.segments) ? source.segments : [];
  return {
    elite: intersects(segments, ELITE_SEGMENTS),
    specialty: intersects(segments, SPECIALTY_SEGMENTS),
  };
}

export function selectUniversityPoolSources(config = {}, {
  eliteMaxSchools = 28,
  specialtyMaxSchools = 12,
  maxLinksPerSchool = 16,
} = {}) {
  const enabled = (config.schools || [])
    .filter((source) => source?.enabled && Array.isArray(source.listUrls) && source.listUrls.length)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)
      || String(a.school).localeCompare(String(b.school), 'zh-CN'));

  const elite = enabled.filter((source) => universityPoolType(source).elite).slice(0, eliteMaxSchools);
  const specialty = enabled.filter((source) => universityPoolType(source).specialty).slice(0, specialtyMaxSchools);
  const selected = new Map();
  for (const source of [...elite, ...specialty]) {
    selected.set(source.school, {
      ...source,
      maxLinks: Math.min(Number(source.maxLinks || maxLinksPerSchool), maxLinksPerSchool),
    });
  }
  return [...selected.values()];
}

function decorateUniversityQueryJob(job = {}) {
  const source = job.universitySource || {};
  const segments = Array.isArray(source.segments) ? source.segments : [];
  const type = universityPoolType(source);
  const query = toQueryJob({
    ...job,
    // 高校详情页通常是一整份招聘简章；把原始页面正文作为独立池的 JD 事实，
    // 避免 generic description 把真实岗位内容覆盖掉。
    jobDescription: job._searchText || job.jobDescription || job.description || '',
  });
  return {
    ...query,
    source: 'university-employment',
    sourceType: 'secondary',
    sourceChannel: 'university',
    sourcePool: 'university-employment',
    sourceURL: job.sourceUrl || '',
    officialURL: job.officialCareerUrl || '',
    verification: job.verification || '高校就业信息网官方发布 · 待公司官网复核',
    sourceEvidence: Array.isArray(job.sourceEvidence) ? job.sourceEvidence : [],
    universitySource: {
      school: source.school || '',
      segments,
      priority: Number(source.priority || 0),
    },
    universitySchool: source.school || '',
    universitySegments: segments,
    universityElite: type.elite,
    universitySpecialty: type.specialty,
  };
}

function dedupeQueryJobs(jobs = []) {
  const out = new Map();
  for (const job of jobs) {
    const key = [job.company, job.title, job.location, job.universitySchool]
      .map((x) => String(x || '').trim().toLowerCase()).join('|');
    if (!key.replaceAll('|', '')) continue;
    const prev = out.get(key);
    if (!prev || String(job.publishedAt || '') > String(prev.publishedAt || '')) out.set(key, job);
  }
  return [...out.values()];
}

function payload(jobs, updatedAt, pool, scannedSchools) {
  return {
    schemaVersion: 1,
    updatedAt,
    sourcePool: 'university-employment',
    pool,
    scannedSchools,
    totalJobs: jobs.length,
    jobs,
  };
}

export async function buildUniversityPool({
  profile,
  config,
  fetcher,
  now = new Date(),
  eliteMaxSchools = 28,
  specialtyMaxSchools = 12,
  maxLinksPerSchool = 16,
  concurrency = 5,
} = {}) {
  const sources = selectUniversityPoolSources(config, {
    eliteMaxSchools,
    specialtyMaxSchools,
    maxLinksPerSchool,
  });
  const scopedConfig = { ...config, schools: sources, maxActiveSchools: sources.length };
  const scan = await searchUniversityJobs(profile, scopedConfig, {
    fetcher,
    now,
    concurrency,
    maxSchools: sources.length,
  });

  const curated = curateDiscoveredJobs(scan.jobs || [])
    .filter((job) => !job.excludeFromLiveBoard)
    .filter((job) => !isOutOfScopeProfessionalRole(job));
  const jobs = dedupeQueryJobs(curated.map(decorateUniversityQueryJob));
  const eliteJobs = jobs.filter((job) => job.universityElite);
  const specialtyJobs = jobs.filter((job) => job.universitySpecialty);

  return {
    sources,
    stats: scan.stats || {},
    jobs,
    eliteJobs,
    specialtyJobs,
  };
}

async function writeOutputs(result, updatedAt) {
  await fs.mkdir(indexDir, { recursive: true });
  await fs.rm(byUniversityDir, { recursive: true, force: true });
  await fs.mkdir(byUniversityDir, { recursive: true });

  const schoolNames = result.sources.map((x) => x.school);
  await fs.writeFile(
    path.join(indexDir, 'university-jobs.json'),
    `${JSON.stringify(payload(result.jobs, updatedAt, 'all-target-universities', schoolNames), null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(indexDir, 'university-elite-jobs.json'),
    `${JSON.stringify(payload(result.eliteJobs, updatedAt, '985-211-double-first-class', schoolNames), null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(indexDir, 'university-specialty-jobs.json'),
    `${JSON.stringify(payload(result.specialtyJobs, updatedAt, 'language-business-specialty', schoolNames), null, 2)}\n`,
    'utf8',
  );

  const bySchool = new Map();
  for (const job of result.jobs) {
    const school = job.universitySchool || 'unknown';
    if (!bySchool.has(school)) bySchool.set(school, []);
    bySchool.get(school).push(job);
  }
  const manifest = [];
  for (const [school, schoolJobs] of [...bySchool.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    const slug = slugifyCompany(school);
    const file = `${slug}.json`;
    const body = {
      schemaVersion: 1,
      updatedAt,
      sourcePool: 'university-employment',
      school,
      segments: schoolJobs[0]?.universitySegments || [],
      totalJobs: schoolJobs.length,
      jobs: schoolJobs,
    };
    await fs.writeFile(path.join(byUniversityDir, file), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    manifest.push({ school, segments: body.segments, count: body.totalJobs, file: `jobs/by-university/${file}` });
  }
  await fs.writeFile(
    path.join(indexDir, 'universities.json'),
    `${JSON.stringify({ schemaVersion: 1, updatedAt, totalUniversities: manifest.length, universities: manifest }, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  const [profile, config] = await Promise.all([
    fs.readFile(profilePath, 'utf8').then(JSON.parse),
    fs.readFile(configPath, 'utf8').then(JSON.parse),
  ]);
  const result = await buildUniversityPool({
    profile,
    config,
    eliteMaxSchools: envInt('UNIVERSITY_ELITE_MAX_SCHOOLS', 28),
    specialtyMaxSchools: envInt('UNIVERSITY_SPECIALTY_MAX_SCHOOLS', 12),
    maxLinksPerSchool: envInt('UNIVERSITY_MAX_LINKS_PER_SCHOOL', 16),
    concurrency: envInt('UNIVERSITY_POOL_CONCURRENCY', 5),
  });
  const updatedAt = new Date().toISOString();
  await writeOutputs(result, updatedAt);
  console.log(`[university-pool] schools=${result.sources.length} jobs=${result.jobs.length} elite=${result.eliteJobs.length} specialty=${result.specialtyJobs.length} listed=${result.stats.listed || 0} errors=${result.stats.errors || 0}`);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
