import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile } from '../src/core/storage.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const fallback = {
  graduationYear: '2027',
  targetRoles: ['国际业务'], targetCities: ['深圳'],
  skills: ['英语','Excel'], languages: ['英语'], experienceKeywords: ['海外'],
  exclusions: ['实习'], workPreference: ['国际业务'],
  experienceEvidence: [{ name: '真实海外业务实习', evidence: '真实证据', keywords: ['海外'] }]
};

test('v2 migration removes old auto skills and refreshes resume evidence', () => {
  globalThis.localStorage = new MemoryStorage();
  localStorage.setItem('ai-job.profile.v2', JSON.stringify({
    ...fallback,
    skills: ['英语','Jira','Shopify','Notion'],
    experienceEvidence: [{ name: '旧浏览器证据', evidence: '过期', keywords: ['旧'] }]
  }));

  const result = loadProfile(fallback);
  assert.equal(result.skills.includes('Jira'), false);
  assert.equal(result.skills.includes('Shopify'), false);
  assert.equal(result.skills.includes('Notion'), true, 'non-legacy custom skill should be preserved');
  assert.deepEqual(result.experienceEvidence, fallback.experienceEvidence);
  assert.ok(localStorage.getItem('ai-job.profile.v3'));
});

test('v3 profile preserves user-added skills but always refreshes evidence baseline', () => {
  globalThis.localStorage = new MemoryStorage();
  saveProfile({
    ...fallback,
    skills: ['英语','SQL'],
    experienceEvidence: [{ name: '被修改的证据', evidence: '不应继续使用', keywords: ['SQL'] }]
  });

  const result = loadProfile(fallback);
  assert.equal(result.skills.includes('SQL'), true);
  assert.deepEqual(result.experienceEvidence, fallback.experienceEvidence);
});
