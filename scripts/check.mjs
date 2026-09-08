import fs from 'node:fs';
import path from 'node:path';
import { demoJobs } from '../src/data/jobs.js';
import { liveJobs } from '../src/data/live-jobs.js';

const root = path.resolve(process.cwd());
const required = [
  'index.html', 'src/app.js', 'src/styles.css', 'src/discovery.css', 'src/core/matcher.js',
  'src/core/storage.js', 'src/data/jobs.js', 'src/data/live-jobs.js', 'src/data/profile.js',
  'scripts/job-discovery/core.mjs', 'scripts/job-discovery/nowcoder.mjs', 'scripts/refresh-jobs.mjs',
  'config/search-profile.json', 'README.md', 'docs/PLAN.md'
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

console.log(`Static checks passed: ${required.length} files, ${demoJobs.length} demo jobs, ${liveJobs.length} live jobs, unique ids and provenance OK.`);
