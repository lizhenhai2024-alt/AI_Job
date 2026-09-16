import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scoped = fs.readFileSync(path.join(root, 'scripts/refresh-jobs-scoped.mjs'), 'utf8');
const coreWorkflow = fs.readFileSync(path.join(root, '.github/workflows/refresh-campus-jobs.yml'), 'utf8');
const aiWorkflow = fs.readFileSync(path.join(root, '.github/workflows/analyze-complete-jds-now.yml'), 'utf8');

test('core refresh can explicitly skip LLM evidence while retaining deterministic enrichment', () => {
  assert.match(scoped, /SKIP_JD_EVIDENCE/);
  assert.match(scoped, /!SKIP_JD_EVIDENCE/);
  assert.match(scoped, /enrich-jd-evidence\.mjs/);
  assert.match(scoped, /enrich-job-compensation\.mjs/);
  assert.match(coreWorkflow, /SKIP_JD_EVIDENCE:\s*1/);
  assert.doesNotMatch(coreWorkflow, /JD_EVIDENCE_MAX_CALLS:\s*1500/);
  assert.doesNotMatch(coreWorkflow, /GEMINI_API_KEY:\s*\$\{\{ secrets\.GEMINI_API_KEY \}\}/);
});

test('AI evidence remains automated in an independent scheduled workflow', () => {
  assert.match(aiWorkflow, /schedule:/);
  assert.match(aiWorkflow, /cron:\s*'30 0 \* \* \*'/);
  assert.match(aiWorkflow, /node scripts\/enrich-jd-evidence\.mjs/);
  assert.match(aiWorkflow, /JD_EVIDENCE_MAX_CALLS:\s*1500/);
  assert.match(aiWorkflow, /JD_EVIDENCE_PAID_MAX_CALLS:\s*200/);
  assert.match(aiWorkflow, /concurrency:/);
});

test('core refresh has enough timeout margin for source discovery and commit', () => {
  assert.match(coreWorkflow, /timeout-minutes:\s*35/);
  assert.match(coreWorkflow, /Commit refreshed job pool and source health/);
});
