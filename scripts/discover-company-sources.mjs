#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { companyRegistry } from '../src/data/company-registry.js';
import {
  buildDiscoveryQueue,
  canonicalCompanyKey,
  cohortEvidence,
  extractSearchCandidates,
  mergeAuditEntry,
  sourceProviderFromUrl
} from './job-discovery/source-candidates.mjs';
import { probeFeishuSource } from './job-discovery/source-probes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditPath = path.join(root, 'config/source-discovery.json');
const sourcesPath = path.join(root, 'config/official-sources.json');
const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'));
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
const now = new Date();
const batchSize = Math.max(1, Math.min(Number(process.env.SOURCE_DISCOVERY_BATCH || 12), 40));
const forceRetry = process.env.SOURCE_DISCOVERY_FORCE_RETRY === '1' || process.env.GITHUB_EVENT_NAME === 'push';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cleanText(value = '') {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function sameCompany(a, b) {
  const left = canonicalCompanyKey(a);
  const right = canonicalCompanyKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left));
}

function sourceEntries(provider) {
  const value = sources[provider];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sourceExists(name) {
  return Object.entries(sources).some(([, value]) => (Array.isArray(value) ? value : value ? [value] : []).some((item) => sameCompany(item?.company, name)));
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
        ...(options.headers || {})
      }
    });
    return { ok: response.ok, status: response.status, url: response.url || url, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, url, text: '', error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function mergeCandidates(target, rows = []) {
  const known = new Set(target.map((item) => item.url));
  for (const item of rows) {
    if (!item?.url || known.has(item.url)) continue;
    known.add(item.url);
    target.push(item);
  }
}

async function searchCandidates(query) {
  const encoded = encodeURIComponent(query);
  const engines = [
    `https://html.duckduckgo.com/html/?q=${encoded}`,
    `https://lite.duckduckgo.com/lite/?q=${encoded}`,
    `https://www.bing.com/search?q=${encoded}&setlang=zh-Hans`
  ];
  const found = [];
  for (const url of engines) {
    const result = await fetchText(url, { timeoutMs: 12000 });
    if (!result.ok || result.text.length < 300) continue;
    const rows = extractSearchCandidates(result.text);
    mergeCandidates(found, rows);
    if (rows.some((item) => item.provider)) break;
  }
  return found;
}

function companyQueryNames(company) {
  const names = [company.name, ...(company.aliases || [])]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return [...new Set(names)].slice(0, 4);
}

function directCandidateText(company) {
  if (!company.careerUrl) return '';
  const origin = company.careerUrlSeeded ? '已核验官方招聘入口种子' : company.userRequested ? '用户提供招聘入口' : '已发现招聘入口';
  const seedEvidence = company.careerUrlSeeded
    ? [company.careerUrlEvidence, company.careerUrlGraduationYear === '2027' ? company.careerUrlCohortEvidence : ''].filter(Boolean).join(' ')
    : '';
  return `${company.name} 官方招聘 ${origin} ${seedEvidence}`.trim();
}

async function discoverCandidates(company) {
  const direct = company.careerUrl ? [{ url: company.careerUrl, text: directCandidateText(company), provider: sourceProviderFromUrl(company.careerUrl) }] : [];
  const found = [...direct];
  const seen = new Set(direct.map((item) => item.url));
  const queries = [];
  for (const name of companyQueryNames(company)) {
    queries.push(
      `"${name}" 2027 校园招聘 官方`,
      `"${name}" 招聘 官网 careers`,
      `"${name}" 校园招聘 site:app.mokahr.com`,
      `"${name}" 校园招聘 site:zhiye.com`,
      `"${name}" 校园招聘 site:jobs.feishu.cn`,
      `"${name}" 校园招聘 site:wecruit.hotjob.cn`
    );
  }
  for (const query of queries) {
    const rows = await searchCandidates(query);
    for (const item of rows) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      found.push(item);
    }
    if (found.some((item) => item.provider)) break;
    if (found.length >= 8) break;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return found.slice(0, 16);
}

function companyIdentityEvidence(company, text = '') {
  const hay = canonicalCompanyKey(text);
  const candidates = [company.name, ...(company.aliases || [])].filter(Boolean);
  for (const value of candidates) {
    const key = canonicalCompanyKey(value);
    if (key.length >= 3 && hay.includes(key)) return true;
    if (String(text).toLowerCase().includes(String(value).toLowerCase())) return true;
  }
  return false;
}

function feishuWebsitePath(value = '', html = '') {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const first = parts.find((part) => !['m', 'position', 'positions', 'job', 'jobs', 'detail'].includes(part.toLowerCase()));
    if (first && /^[A-Za-z0-9_/-]{1,80}$/.test(first)) return first;
  } catch {}
  const script = String(html).match(/<script[^>]+id=["']js-websiteInfo["'][^>]*>([\s\S]*?)<\/script>/i);
  if (script) {
    try {
      const payload = JSON.parse(script[1].trim());
      const pathValue = String(payload?.website_info?.path || '').replace(/^\/+|\/+$/g, '');
      if (/^[A-Za-z0-9_/-]{1,80}$/.test(pathValue)) return pathValue;
    } catch {}
  }
  return '';
}

async function probeBeisen(baseUrl) {
  const result = await fetchText(`${baseUrl}/api/Jobad/GetJobAdPageList`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', referer: `${baseUrl}/campus/jobs`, origin: baseUrl, 'x-requested-with': 'xmlhttprequest', langtype: 'zh_CN' },
    body: JSON.stringify({ PageIndex: 0, PageSize: 3, KeyWords: '', SpecialType: 0, PortalId: '', DisplayFields: ['Category','LocId','Org','PostDate','Duty','Require'] })
  });
  if (!result.ok) return { ok: false, reason: `北森 API HTTP ${result.status}` };
  try {
    const payload = JSON.parse(result.text);
    if (payload?.Code !== 200 || !Array.isArray(payload?.Data)) return { ok: false, reason: '北森 API 响应结构不匹配' };
    return { ok: true, total: Number(payload.Count ?? payload.Total ?? payload.Data.length) };
  } catch {
    return { ok: false, reason: '北森 API 非 JSON 响应' };
  }
}

async function validateCandidate(company, candidate) {
  const inspected = await fetchText(candidate.url);
  const finalUrl = inspected.url || candidate.url;
  const provider = sourceProviderFromUrl(finalUrl) || candidate.provider || sourceProviderFromUrl(candidate.url);
  const pageText = cleanText(inspected.text).slice(0, 300000);
  const evidenceText = `${candidate.text || ''} ${pageText}`;
  if (!inspected.ok) return { state: 'candidate_found', provider, url: finalUrl, reason: `候选官网不可稳定访问：HTTP ${inspected.status || 0}` };
  if (!companyIdentityEvidence(company, evidenceText)) return { state: 'candidate_rejected', provider, url: finalUrl, reason: '候选页面缺少足够的公司身份信息，未自动接入' };

  if (provider === 'moka') {
    if (!/\/campus(?:-|_|\/)|campus[_-]?recruitment|campus_apply/i.test(new URL(finalUrl).pathname)) {
      return { state: 'candidate_found', provider, url: finalUrl, reason: '识别为 Moka，但不是明确校园招聘入口' };
    }
    return {
      state: 'source_registered', provider, url: finalUrl,
      source: { company: company.name, url: finalUrl, graduationYear: '2027', strictCohort: true, monitoringNote: '自动来源发现；仅岗位明确出现2027届/27届证据时入池' },
      reason: 'Moka 校招入口可访问；启用岗位级2027严格证据'
    };
  }

  if (provider === 'beisen') {
    const url = new URL(finalUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    if (!cohortEvidence(evidenceText)) return { state: 'no_2027_evidence', provider, url: finalUrl, reason: '识别为北森，但当前页面/已核验证据没有明确2027校招信息' };
    const probe = await probeBeisen(baseUrl);
    if (!probe.ok) return { state: 'needs_adapter', provider, url: finalUrl, reason: `北森2027证据存在，但标准API探针未通过：${probe.reason}` };
    return { state: 'source_registered', provider, url: finalUrl, source: { company: company.name, baseUrl, graduationYear: '2027' }, reason: `北森2027证据和标准API均通过（岗位约${probe.total}）` };
  }

  if (provider === 'feishu') {
    const url = new URL(finalUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    const websitePath = feishuWebsitePath(finalUrl, inspected.text);
    if (!websitePath) return { state: 'needs_adapter', provider, url: finalUrl, reason: '识别为飞书招聘，但无法确定 website-path' };
    const probe = await probeFeishuSource({
      company: company.name,
      baseUrl,
      websitePath,
      detailTemplate: `${baseUrl}/${websitePath}/m/position/{id}/detail`,
      pageSize: 100,
      maxPages: 3,
      maxJobs: 300
    });
    if (!probe.ok) return { state: 'candidate_found', provider, url: finalUrl, reason: probe.reason };
    const explicitPageCohort = cohortEvidence(evidenceText);
    const genericPath = /^(index|home|jobs?)$/i.test(websitePath);
    if (probe.nonInternCohort <= 0 && !explicitPageCohort) {
      return { state: 'no_2027_evidence', provider, url: finalUrl, reason: `飞书 path=${websitePath} 可访问，但抽样${probe.listed}个岗位未找到正式2027校招证据` };
    }
    if (genericPath && probe.nonInternCohort <= 0) {
      return { state: 'needs_adapter', provider, url: finalUrl, reason: `飞书 path=${websitePath} 过宽；需要定位2027正式批专属入口，禁止将总招聘页直接作为2027源` };
    }
    return {
      state: 'source_registered', provider, url: finalUrl,
      source: { company: company.name, baseUrl, websitePath, graduationYear: '2027', detailTemplate: `${baseUrl}/${websitePath}/m/position/{id}/detail`, pageSize: 100, maxPages: 30, maxJobs: 3000, monitoringNote: '自动来源发现；岗位级继续要求2027届证据' },
      reason: `飞书 path=${websitePath} 生产探针通过；抽样${probe.listed}个岗位，正式2027命中${probe.nonInternCohort}`
    };
  }

  if (provider === 'hotjob') {
    const tenant = finalUrl.match(/\/SU([a-f0-9]{24})\//i)?.[1] || '';
    if (!tenant) return { state: 'needs_adapter', provider, url: finalUrl, reason: '识别为 HotJob，但无法提取 tenant' };
    if (!cohortEvidence(evidenceText)) return { state: 'no_2027_evidence', provider, url: finalUrl, reason: '识别为 HotJob，但页面没有明确2027校招证据' };
    const schoolUrl = `https://wecruit.hotjob.cn/SU${tenant}/pb/school.html`;
    return {
      state: 'source_registered', provider, url: schoolUrl,
      source: { company: company.name, baseUrl: 'https://wecruit.hotjob.cn', tenant, url: schoolUrl, graduationYear: '2027', projectEvidence: '2027', pageSize: 100, maxPages: 100, maxDetails: 120, listConcurrency: 6, detailConcurrency: 5 },
      reason: 'HotJob tenant 与2027校招页面证据已确认'
    };
  }

  return { state: 'needs_adapter', provider: '', url: finalUrl, reason: '找到疑似官方招聘页，但当前不是已支持ATS；进入适配队列，不自动注册' };
}

function registerSource(result) {
  if (!result?.source || !result.provider || sourceExists(result.source.company)) return false;
  if (!Array.isArray(sources[result.provider])) return false;
  sources[result.provider].push(result.source);
  return true;
}

async function processCompany(company) {
  const candidates = await discoverCandidates(company);
  if (!candidates.length) return { state: 'not_found', provider: '', officialUrl: '', reason: '本轮未找到可信官方招聘入口', candidates: [] };
  const evaluated = [];
  for (const candidate of candidates) {
    const result = await validateCandidate(company, candidate);
    evaluated.push({ url: result.url || candidate.url, provider: result.provider || candidate.provider || '', state: result.state, reason: result.reason });
    if (result.state === 'source_registered') {
      const registered = registerSource(result);
      return {
        state: registered ? 'source_registered' : 'candidate_found',
        provider: result.provider,
        officialUrl: result.url,
        reason: registered ? result.reason : `${result.reason}；但source registry已存在等价公司或provider不可追加`,
        candidates: evaluated,
        sourceRegistered: registered
      };
    }
  }
  const best = evaluated.find((item) => item.state === 'needs_adapter') || evaluated.find((item) => item.state === 'no_2027_evidence') || evaluated.find((item) => item.state === 'candidate_found') || evaluated[0];
  return { state: best?.state || 'not_found', provider: best?.provider || '', officialUrl: best?.url || '', reason: best?.reason || '未找到可自动接入来源', candidates: evaluated };
}

const queue = buildDiscoveryQueue(companyRegistry, audit, { limit: batchSize, now, forceRetry });
let sourcesAdded = 0;
let errors = 0;
console.log(`[source-discovery] queue=${queue.length} batch=${batchSize} forceRetry=${forceRetry}`);
for (const company of queue) {
  if (sourceExists(company.name)) continue;
  let result;
  try {
    result = await processCompany(company);
  } catch (error) {
    errors++;
    result = { state: 'search_error', provider: '', officialUrl: '', reason: String(error?.message || error), candidates: [] };
  }
  if (result.sourceRegistered) sourcesAdded++;
  const previous = audit.companies?.[company.key] || {};
  audit.companies ||= {};
  audit.companies[company.key] = mergeAuditEntry(previous, {
    name: company.name,
    status: company.status,
    state: result.state,
    provider: result.provider || '',
    officialUrl: result.officialUrl || '',
    reason: result.reason || '',
    candidates: (result.candidates || []).slice(0, 8)
  }, now);
  console.log(`[source-discovery:${company.name}] state=${result.state} provider=${result.provider || '-'} ${result.reason || ''}`);
}

audit.updatedAt = now.toISOString();
audit.lastRun = { processed: queue.length, sourcesAdded, errors, batchSize, forceRetry };
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
if (sourcesAdded) await fs.writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, 'utf8');

if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, `processed=${queue.length}\nsources_added=${sourcesAdded}\nerrors=${errors}\n`, 'utf8');
}
console.log(`[source-discovery] processed=${queue.length} sourcesAdded=${sourcesAdded} errors=${errors}`);
