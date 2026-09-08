import fs from 'node:fs';
import path from 'node:path';
import { demoJobs } from '../src/data/jobs.js';
import { liveJobs } from '../src/data/live-jobs.js';

const root = path.resolve(process.cwd());
const required = [
  'index.html', 'src/app.js', 'src/styles.css', 'src/discovery.css', 'src/core/matcher.js',
  'src/core/storage.js', 'src/data/jobs.js', 'src/data/live-jobs.js', 'src/data/profile.js',
  'scripts/job-discovery/core.mjs', 'scripts/job-discovery/nowcoder.mjs', 'scripts/job-discovery/moka.mjs', 'scripts/job-discovery/beisen.mjs', 'scripts/job-discovery/anker.mjs', 'scripts/job-discovery/ecoflow.mjs', 'scripts/refresh-jobs.mjs',
  'config/search-profile.json', 'config/official-sources.json', 'README.md', 'docs/PLAN.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing required file: ${file}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('./src/app.js') || !html.includes('./src/styles.css') || !html.includes('./src/discovery.css')) {
  throw new Error('index.html asset references are incomplete');
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

const anker = sources.anker;
if (!anker || anker.company !== '安克创新' || anker.url !== 'https://career.anker-in.com/universities/recruitment/' || anker.apiBase !== 'https://rainbowbridge.anker.com' || !anker.websiteId || anker.graduationYear !== '2027' || Number(anker.maxJobs) < 10 || Number(anker.maxPages) < 1) {
  throw new Error('official Anker source registry validation failed');
}

const ecoflow = sources.ecoflow;
if (!ecoflow || ecoflow.company !== '正浩创新EcoFlow' || !/^https:\/\/jobs\.ecoflow\.com\/602892/.test(ecoflow.url) || ecoflow.apiBase !== 'https://jobs.ecoflow.com' || ecoflow.websitePath !== '602892' || Number(ecoflow.portalType) !== 6 || ecoflow.graduationYear !== '2027' || Number(ecoflow.maxJobs) < 10 || Number(ecoflow.maxPages) < 1) {
  throw new Error('official EcoFlow Feishu API registry validation failed');
}

console.log(`Static checks passed: ${required.length} files, ${demoJobs.length} demo jobs, ${liveJobs.length} live jobs, ${sources.moka.length} Moka portals, ${sources.beisen.length} Beisen portals, Anker paginated API, EcoFlow public Feishu API, provenance OK.`);
