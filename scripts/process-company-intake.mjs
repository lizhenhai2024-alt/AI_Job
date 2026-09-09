#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  COMPANY_INTAKE_MARKER,
  canonicalCompanyIntakeKey,
  normalizeCareerUrl,
  normalizeCompanyName
} from '../src/core/company-intake.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error('GitHub event path is required');

const event = JSON.parse(await fs.readFile(eventPath, 'utf8'));
const issue = event.issue || {};
const body = String(issue.body || '');
if (!String(issue.title || '').startsWith('[Company Intake]') || !body.includes(COMPANY_INTAKE_MARKER)) {
  throw new Error('Issue is not an AI Job company intake request');
}

function field(name) {
  const prefix = `${name}:`;
  const line = body.split(/\r?\n/).find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function splitFocus(value = '') {
  return [...new Set(String(value).split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

function cohortEvidence(text = '') {
  return /2027\s*届|27\s*届|2027[^\n。]{0,30}(校园招聘|校招|秋招)|(校园招聘|校招|秋招)[^\n。]{0,30}2027/i.test(String(text));
}

async function inspectUrl(url) {
  if (!url) return { ok: false, html: '', finalUrl: '', error: '未提供官方招聘链接' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7'
      }
    });
    clearTimeout(timer);
    const html = await response.text();
    return { ok: response.ok, html: html.slice(0, 2_000_000), finalUrl: response.url || url, error: response.ok ? '' : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, html: '', finalUrl: url, error: String(error?.message || error) };
  }
}

function feishuWebsitePath(url, html = '') {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const first = parts.find((part) => !['m','position','positions','job','jobs','detail'].includes(part.toLowerCase()));
    if (first && /^[A-Za-z0-9_/-]{1,80}$/.test(first)) return first;
  } catch {}
  const match = String(html).match(/<script[^>]+id=["']js-websiteInfo["'][^>]*>([\s\S]*?)<\/script>/i);
  if (match) {
    try {
      const payload = JSON.parse(match[1].trim());
      const value = String(payload?.website_info?.path || '').replace(/^\/+|\/+$/g, '');
      if (/^[A-Za-z0-9_/-]{1,80}$/.test(value)) return value;
    } catch {}
  }
  return '';
}

async function probeBeisenApi(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/Jobad/GetJobAdPageList`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; AI-Job/0.4; +https://github.com/lizhenhai2024-alt/AI_Job)',
        referer: `${baseUrl}/campus/jobs`, origin: baseUrl, 'x-requested-with': 'xmlhttprequest', langtype: 'zh_CN'
      },
      body: JSON.stringify({ PageIndex: 0, PageSize: 2, KeyWords: '', SpecialType: 0, PortalId: '', DisplayFields: ['Category','LocId','Org','PostDate','Duty','Require'] })
    });
    if (!response.ok) return { ok: false, reason: `北森 API HTTP ${response.status}` };
    const payload = JSON.parse(await response.text());
    if (payload?.Code !== 200 || !Array.isArray(payload?.Data)) return { ok: false, reason: payload?.Message || '北森 API 响应结构不匹配' };
    return { ok: true, rows: payload.Data.length, total: Number(payload.Count ?? payload.Total ?? payload.Data.length) };
  } catch (error) {
    return { ok: false, reason: `北森 API 探针失败：${String(error?.message || error)}` };
  }
}

async function probeFeishuApi(baseUrl, websitePath) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/search/job/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json', 'accept-language': 'zh-CN,zh;q=0.9',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        referer: `${baseUrl}/${websitePath}/`, 'website-path': websitePath
      },
      body: JSON.stringify({ limit: 2, offset: 0 })
    });
    if (!response.ok) return { ok: false, reason: `飞书 API HTTP ${response.status}` };
    const payload = await response.json();
    const posts = payload?.data?.job_post_list;
    if (Number(payload?.code) !== 0 || !Array.isArray(posts)) return { ok: false, reason: `飞书 API code ${payload?.code ?? 'missing'}` };
    const count = Number(payload?.data?.count || posts.length);
    if (count <= 0 && posts.length === 0) return { ok: false, reason: '飞书 website-path 可访问但当前返回 0 个岗位，暂不注册为生产源' };
    return { ok: true, rows: posts.length, total: count };
  } catch (error) {
    return { ok: false, reason: `飞书 API 探针失败：${String(error?.message || error)}` };
  }
}

async function providerDetection(careerUrl, html = '', inspectedOk = false) {
  if (!careerUrl) return { provider: '', source: null, reason: '未提供官方招聘链接' };
  let url;
  try { url = new URL(careerUrl); } catch { return { provider: '', source: null, reason: '招聘链接格式无效' }; }
  const host = url.hostname.toLowerCase();
  if (host === 'app.mokahr.com') {
    if (!inspectedOk) return { provider: 'moka', source: null, reason: '识别为 Moka，但官方链接当前不可访问，暂不注册' };
    return {
      provider: 'moka',
      source: {
        company: '', url: careerUrl, graduationYear: '2027', strictCohort: true,
        monitoringNote: '用户新增公司；仅岗位明确出现2027届/27届证据时入池'
      },
      reason: '识别为 Moka；链接可访问，并启用岗位级 2027 届严格证据'
    };
  }
  if (host.endsWith('.jobs.feishu.cn')) {
    const websitePath = feishuWebsitePath(careerUrl, html);
    if (!websitePath) return { provider: 'feishu', source: null, reason: '识别为飞书招聘，但未能确定 website-path' };
    const baseUrl = `${url.protocol}//${url.host}`;
    const probe = await probeFeishuApi(baseUrl, websitePath);
    if (!probe.ok) return { provider: 'feishu', source: null, reason: `识别为飞书招聘 website-path=${websitePath}；${probe.reason}` };
    return {
      provider: 'feishu',
      source: { company: '', baseUrl, websitePath, graduationYear: '2027', pageSize: 100, maxPages: 30, maxJobs: 3000 },
      reason: `识别为飞书招聘 website-path=${websitePath}；API 探针通过（岗位 ${probe.total}），现有抓取器仍要求岗位文本明确 2027 届`
    };
  }
  if (host.endsWith('.zhiye.com')) {
    const baseUrl = `${url.protocol}//${url.host}`;
    if (!cohortEvidence(html)) return { provider: 'beisen', source: null, reason: '识别为北森，但页面未找到明确 2027 届校招证据' };
    const probe = await probeBeisenApi(baseUrl);
    if (!probe.ok) return { provider: 'beisen', source: null, reason: `识别为北森且有 2027 证据，但标准 API 探针未通过：${probe.reason}；可能是国贸式特殊 HTML 模板，留待适配` };
    return {
      provider: 'beisen', source: { company: '', baseUrl, graduationYear: '2027' },
      reason: `识别为北森；2027 届证据和标准 API 探针均通过（岗位 ${probe.total}）`
    };
  }
  if (host === 'wecruit.hotjob.cn') {
    const tenant = careerUrl.match(/\/SU([a-f0-9]{24})\//i)?.[1] || '';
    if (!tenant) return { provider: 'hotjob', source: null, reason: '识别为 HotJob，但无法提取 tenant' };
    if (!cohortEvidence(html)) return { provider: 'hotjob', source: null, reason: '识别为 HotJob，但页面未找到明确 2027 届证据' };
    const schoolUrl = `https://wecruit.hotjob.cn/SU${tenant}/pb/school.html`;
    return {
      provider: 'hotjob',
      source: {
        company: '', baseUrl: 'https://wecruit.hotjob.cn', tenant, url: schoolUrl, graduationYear: '2027',
        projectEvidence: '2027', pageSize: 100, maxPages: 100, maxDetails: 120, listConcurrency: 6, detailConcurrency: 5
      },
      reason: '识别为 HotJob，tenant 与 2027 届页面证据均已确认'
    };
  }
  return { provider: '', source: null, reason: `暂未支持自动识别该招聘系统：${host}` };
}

function sourceEntries(config, provider) {
  const current = config[provider];
  if (Array.isArray(current)) return current;
  return current ? [current] : [];
}

function sameCompany(a, b) {
  const left = canonicalCompanyIntakeKey(a);
  const right = canonicalCompanyIntakeKey(b);
  return Boolean(left && right && (left === right || (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left)))));
}

const name = normalizeCompanyName(field('company'));
if (!name) throw new Error('company field is required');
const careerUrl = normalizeCareerUrl(field('career_url'));
const focus = splitFocus(field('focus'));
const note = field('note').slice(0, 500);
const inspected = await inspectUrl(careerUrl);
const effectiveUrl = normalizeCareerUrl(inspected.finalUrl) || careerUrl;
const detected = await providerDetection(effectiveUrl, inspected.html, inspected.ok);

const requestsPath = path.join(root, 'config/company-requests.json');
const sourcesPath = path.join(root, 'config/official-sources.json');
const requests = JSON.parse(await fs.readFile(requestsPath, 'utf8'));
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
const key = canonicalCompanyIntakeKey(name);
const now = new Date().toISOString();
let sourceRegistered = false;
let sourceAlreadyExists = false;

if (detected.provider && detected.source) {
  const entries = sourceEntries(sources, detected.provider);
  sourceAlreadyExists = entries.some((item) => sameCompany(item?.company, name));
  if (!sourceAlreadyExists) {
    detected.source.company = name;
    if (!Array.isArray(sources[detected.provider])) {
      if (sources[detected.provider]) throw new Error(`Provider ${detected.provider} is not list-shaped and cannot accept generic intake`);
      sources[detected.provider] = [];
    }
    sources[detected.provider].push(detected.source);
    sourceRegistered = true;
  }
}

let status = '待适配招聘源';
if (!careerUrl) status = '待发现官方招聘入口';
else if (detected.source && (sourceRegistered || sourceAlreadyExists)) status = sourceAlreadyExists ? '官方源已存在' : '已识别官方源，等待岗位刷新';
else if (detected.provider) status = '已识别招聘系统，待核2027/参数';

const request = {
  id: `intake-${crypto.createHash('sha1').update(`${key}|${issue.number || ''}`).digest('hex').slice(0, 12)}`,
  name, careerUrl: effectiveUrl || careerUrl, focus, note,
  requestedAt: issue.created_at || now, updatedAt: now,
  issueNumber: issue.number || null, issueUrl: issue.html_url || '',
  status, provider: detected.provider || '',
  sourceRegistered: sourceRegistered || sourceAlreadyExists, sourceAlreadyExists,
  analysis: detected.reason + (inspected.error ? `；页面探针：${inspected.error}` : inspected.ok ? '；官方链接可访问' : '')
};

const existingIndex = requests.findIndex((item) => sameCompany(item?.name, name));
if (existingIndex >= 0) requests[existingIndex] = { ...requests[existingIndex], ...request, id: requests[existingIndex].id || request.id };
else requests.push(request);
requests.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
await fs.writeFile(requestsPath, `${JSON.stringify(requests, null, 2)}\n`, 'utf8');
if (sourceRegistered) await fs.writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, 'utf8');

if (process.env.GITHUB_OUTPUT) {
  const output = [
    `company=${name}`, `status=${status}`, `provider=${detected.provider || 'unknown'}`,
    `source_registered=${sourceRegistered ? 'true' : 'false'}`, `source_exists=${sourceAlreadyExists ? 'true' : 'false'}`
  ].join('\n');
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${output}\n`, 'utf8');
}
console.log(JSON.stringify({ company: name, status, provider: detected.provider || '', sourceRegistered, sourceAlreadyExists, analysis: request.analysis }, null, 2));
