#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalCompanyKey, sourceProviderFromUrl } from './source-candidates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const livePath = path.join(root, 'src/data/live-jobs.js');
const sourcesPath = path.join(root, 'config/official-sources.json');
const auditPath = path.join(root, 'config/source-discovery.json');
const requestsPath = path.join(root, 'config/company-requests.json');

function sourceEntries(config, provider) {
  const value = config?.[provider];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sameCompany(a, b) {
  const left = canonicalCompanyKey(a);
  const right = canonicalCompanyKey(b);
  return Boolean(left && right && (left === right || (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left)))));
}

function sourceExists(config, company) {
  return Object.values(config || {}).some((value) => (Array.isArray(value) ? value : value ? [value] : []).some((item) => sameCompany(item?.company, company)));
}

export function sourceFromUniversityJob(job = {}) {
  const url = String(job.officialCareerUrl || '').trim();
  if (!url || job.sourceChannel !== 'university' || String(job.graduationYear || '') !== '2027') return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const provider = sourceProviderFromUrl(url);
  if (provider === 'moka') {
    if (!/campus/i.test(parsed.pathname)) return { provider, source: null, state: 'needs_adapter', reason: 'Moka链接不是明确校园招聘入口' };
    return {
      provider,
      source: { company: job.company, url, graduationYear: '2027', strictCohort: true, monitoringNote: `高校就业网自动发现：${job.universitySource?.school || '高校'}；岗位级继续要求2027届证据` },
      state: 'source_registered',
      reason: '高校详情页明确给出Moka校园招聘入口'
    };
  }
  if (provider === 'beisen') {
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    return {
      provider,
      source: { company: job.company, baseUrl, graduationYear: '2027', monitoringNote: `高校就业网自动发现：${job.universitySource?.school || '高校'}；后续由source health验证标准北森抓取` },
      state: 'source_registered',
      reason: '高校详情页明确给出北森招聘入口'
    };
  }
  if (provider === 'feishu') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    const websitePath = parts.find((part) => !['m','position','positions','job','jobs','detail'].includes(part.toLowerCase())) || '';
    if (!websitePath) return { provider, source: null, state: 'needs_adapter', reason: '飞书招聘入口缺少website-path' };
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    return {
      provider,
      source: { company: job.company, baseUrl, websitePath, graduationYear: '2027', detailTemplate: `${baseUrl}/${websitePath}/m/position/{id}/detail`, pageSize: 100, maxPages: 30, maxJobs: 3000, monitoringNote: `高校就业网自动发现：${job.universitySource?.school || '高校'}` },
      state: 'source_registered',
      reason: '高校详情页明确给出飞书招聘入口'
    };
  }
  if (provider === 'hotjob') {
    const tenant = url.match(/\/SU([a-f0-9]{24})\//i)?.[1] || '';
    if (!tenant) return { provider, source: null, state: 'needs_adapter', reason: 'HotJob入口缺少tenant' };
    const schoolUrl = `https://wecruit.hotjob.cn/SU${tenant}/mc/index`;
    return {
      provider,
      source: { company: job.company, baseUrl: 'https://wecruit.hotjob.cn', tenant, url: schoolUrl, graduationYear: '2027', projectEvidence: '2027', pageSize: 100, maxPages: 100, maxDetails: 120, listConcurrency: 6, detailConcurrency: 5, monitoringNote: `高校就业网自动发现：${job.universitySource?.school || '高校'}` },
      state: 'source_registered',
      reason: '高校详情页明确给出HotJob招聘入口'
    };
  }
  return { provider: '', source: null, state: 'needs_adapter', reason: `已发现公司官方招聘入口，但当前站点 ${parsed.hostname} 尚无自动抓取适配器` };
}

function isExcludedCompany(name) {
  const n = String(name || '').trim();
  return /^\d+\./.test(n);
}

function upsertRequest(requests, job, bridge, now) {
  const key = canonicalCompanyKey(job.company);
  const index = requests.findIndex((item) => canonicalCompanyKey(item?.name) === key);
  const patch = {
    id: index >= 0 ? requests[index].id : `auto-${crypto.createHash('sha1').update(`${key}|${job.officialCareerUrl}`).digest('hex').slice(0, 12)}`,
    name: job.company,
    careerUrl: job.officialCareerUrl,
    focus: [],
    note: `${job.universitySource?.school || '高校就业网'}自动发现；源页面：${job.sourceUrl || ''}`,
    requestedAt: index >= 0 ? requests[index].requestedAt || now : now,
    updatedAt: now,
    status: bridge.state === 'source_registered' ? '高校发现·官方源已注册' : '高校发现·待官方源适配',
    provider: bridge.provider || '',
    sourceRegistered: bridge.state === 'source_registered',
    sourceAlreadyExists: false,
    analysis: bridge.reason
  };
  if (index >= 0) requests[index] = { ...requests[index], ...patch };
  else requests.push(patch);
}

async function main() {
  const liveModule = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const jobs = Array.isArray(liveModule.liveJobs) ? liveModule.liveJobs : [];
  const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
  const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'));
  const requests = JSON.parse(await fs.readFile(requestsPath, 'utf8'));
  const now = new Date().toISOString();
  const candidates = jobs.filter((job) => job?.sourceChannel === 'university' && job?.graduationYear === '2027' && job?.officialCareerUrl);
  let sourcesAdded = 0;
  let queued = 0;

  audit.companies ||= {};
  for (const job of candidates) {
    const bridge = sourceFromUniversityJob(job);
    if (!bridge) continue;
    const key = canonicalCompanyKey(job.company);
    if (!key) continue;
    let registered = false;
    if (bridge.source && bridge.provider && !sourceExists(sources, job.company) && Array.isArray(sources[bridge.provider])) {
      sources[bridge.provider].push(bridge.source);
      registered = true;
      sourcesAdded++;
    }
    const effective = registered || sourceExists(sources, job.company)
      ? { ...bridge, state: 'source_registered', reason: registered ? bridge.reason : `${bridge.reason}；等价官方源已存在` }
      : bridge;
    if (isExcludedCompany(job.company, requests, key)) {
      console.log(`[university-official-bridge] skip excluded company: ${job.company}`);
      continue;
    }
    if (effective.state !== 'source_registered') queued++;
    upsertRequest(requests, job, effective, now);
    audit.companies[key] = {
      ...(audit.companies[key] || {}),
      name: job.company,
      status: '高校自动发现',
      state: effective.state,
      provider: effective.provider || '',
      officialUrl: job.officialCareerUrl,
      reason: effective.reason,
      universityEvidence: { school: job.universitySource?.school || '', sourceUrl: job.sourceUrl || '', graduationYear: job.graduationYear },
      lastCheckedAt: now,
      nextCheckAfter: effective.state === 'source_registered' ? '' : new Date(Date.now() + 86400000).toISOString()
    };
  }

  requests.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  audit.updatedAt = now;
  audit.lastUniversityBridge = { candidates: candidates.length, sourcesAdded, queued, updatedAt: now };
  if (sourcesAdded) await fs.writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, 'utf8');
  await fs.writeFile(requestsPath, `${JSON.stringify(requests, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(`[university-official-bridge] candidates=${candidates.length} sourcesAdded=${sourcesAdded} queued=${queued}`);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
