import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/company-intake.yml', import.meta.url), 'utf8');
const refreshWorkflow = fs.readFileSync(new URL('../.github/workflows/job-refresh.yml', import.meta.url), 'utf8');

test('company intake explicitly dispatches job refresh for a managed source', () => {
  assert.ok(workflow.includes('actions: write'), 'company intake needs Actions write permission to dispatch refresh');
  assert.ok(workflow.includes('Dispatch job refresh for managed source'));
  assert.ok(workflow.includes("steps.intake.outputs.source_registered == 'true'"));
  assert.ok(workflow.includes("steps.intake.outputs.source_exists == 'true'"));
  assert.ok(workflow.includes('gh workflow run job-refresh.yml'));
});

test('job refresh remains manually dispatchable for intake chaining', () => {
  assert.ok(refreshWorkflow.includes('workflow_dispatch:'), 'job-refresh.yml must expose workflow_dispatch');
});
