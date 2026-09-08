import fs from 'node:fs';
import path from 'node:path';
import { demoJobs } from '../src/data/jobs.js';

const root = path.resolve(process.cwd());
const required = [
  'index.html', 'src/app.js', 'src/styles.css', 'src/core/matcher.js',
  'src/core/storage.js', 'src/data/jobs.js', 'src/data/profile.js', 'README.md', 'docs/PLAN.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing required file: ${file}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('./src/app.js') || !html.includes('./src/styles.css')) throw new Error('index.html asset references are incomplete');

const ids = demoJobs.map((job) => job.id);
if (new Set(ids).size !== ids.length) throw new Error('duplicate job ids detected');
if (demoJobs.some((job) => !job.company || !job.title || !job.roleFamily?.length)) throw new Error('job schema validation failed');

console.log(`Static checks passed: ${required.length} files, ${demoJobs.length} demo jobs, unique ids OK.`);
