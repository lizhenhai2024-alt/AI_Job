import { companyRegistry } from './data/company-registry.js';

const SECONDARY_HOST_PATTERNS = [
  /(^|\.)nowcoder\.com$/i,
  /(^|\.)yingjiesheng\.com$/i,
  /(^|\.)jobui\.com$/i,
  /(^|\.)kanzhun\.com$/i,
  /(^|\.)zhipin\.com$/i,
  /(^|\.)liepin\.com$/i,
  /(^|\.)lagou\.com$/i,
  /(^|\.)51job\.com$/i,
  /(^|\.)job5156\.com$/i,
  /(^|\.)bysjy\.com\.cn$/i,
  /(^|\.)bibibi\.net$/i,
  /(^|\.)ncss\.cn$/i,
  /(^|\.)shixiseng\.com$/i,
  /(^|\.)zhaopin\.com$/i
];

function normalizeCompanyName(value = '') {
  return String(value)
    .replace(/^[\s🔴🟢🔵✅❌⭐★•·]+/u, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限责任公司|有限公司|科技股份|集团|控股|中国/gi, '')
    .replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '')
    .toLowerCase()
    .trim();
}

function companyMatches(left, right) {
  const a = normalizeCompanyName(left);
  const b = normalizeCompanyName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a));
}

function parseHttpUrl(value = '') {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function isSecondaryRecruitmentUrl(value = '') {
  const url = parseHttpUrl(value);
  if (!url) return true;
  const host = url.hostname.toLowerCase();
  if (SECONDARY_HOST_PATTERNS.some((pattern) => pattern.test(host))) return true;
  if (/\.edu\.cn$/i.test(host) || /(^|\.)edu\.cn$/i.test(host)) return true;
  return false;
}

function safeOfficialUrl(value = '') {
  const url = parseHttpUrl(value);
  if (!url || isSecondaryRecruitmentUrl(url.href)) return '';
  return url.href;
}

function findCompanyRecord(companyName = '') {
  return companyRegistry.find((record) => companyMatches(companyName, record?.name)
    || (record?.aliases || []).some((alias) => companyMatches(companyName, alias))) || null;
}

function registryApplyUrl(companyName = '') {
  const record = findCompanyRecord(companyName);
  if (!record) return '';

  const careerUrl = safeOfficialUrl(record.careerUrl || '');
  if (careerUrl && (record.careerUrlSeeded || record.userRequested || record.sourceManaged)) return careerUrl;

  const discoveredUrl = safeOfficialUrl(record.sourceDiscoveryUrl || '');
  if (discoveredUrl && ['official_source', 'source_registered', 'needs_adapter'].includes(record.sourceDiscoveryState)) return discoveredUrl;

  return '';
}

function cardText(card) {
  return String(card?.textContent || '');
}

function sourceLinkForCard(card) {
  return [...card.querySelectorAll('a[href]')].find((link) => /查看来源|来源|原始职位/i.test(link.textContent || '')) || null;
}

function sourceIsOfficial(card) {
  const text = cardText(card);
  return /公司官方|官方招聘|官方校招|官方来源|官方职位|官方.*(?:Moka|北森|飞书)|(?:Moka|北森|飞书).*官方/i.test(text)
    && !/二手来源|待官网核验/i.test(text);
}

export function resolveOfficialApplyUrlFromCard(card) {
  if (!card) return '';
  const companyName = card.querySelector('.company')?.textContent?.trim() || '';
  const sourceLink = sourceLinkForCard(card);
  const sourceUrl = safeOfficialUrl(sourceLink?.href || '');

  // Best case: the job itself came from an official company/ATS page, so link
  // directly to the concrete job detail rather than only the company homepage.
  if (sourceUrl && sourceIsOfficial(card)) return sourceUrl;

  // Secondary discovery pages are provenance only. For applying, fall back to a
  // verified/managed official company recruitment entry in the company registry.
  return registryApplyUrl(companyName);
}

function existingApplyLink(card) {
  return [...card.querySelectorAll('a')].find((link) => /立即投递|官网投递|马上投递|去投递/i.test(link.textContent || '')) || null;
}

function markUnavailable(link) {
  if (!link) return;
  link.removeAttribute('href');
  link.removeAttribute('target');
  link.removeAttribute('rel');
  link.setAttribute('aria-disabled', 'true');
  link.classList.add('disabled');
  link.textContent = '官网待核';
  link.title = '尚未核验到公司官方校招/招聘入口；请先查看来源，不跳转到聚合网站。';
}

export function enforceOfficialApplyLinks(root = document) {
  const cards = root.querySelectorAll?.('.job-card') || [];
  for (const card of cards) {
    const officialUrl = resolveOfficialApplyUrlFromCard(card);
    let applyLink = existingApplyLink(card);

    if (!officialUrl) {
      if (applyLink) markUnavailable(applyLink);
      continue;
    }

    if (!applyLink) {
      const actions = card.querySelector('.actions');
      if (!actions) continue;
      applyLink = document.createElement('a');
      applyLink.className = 'btn primary';
      applyLink.textContent = '立即投递';
      applyLink.dataset.officialApply = 'true';
      actions.prepend(applyLink);
    }

    applyLink.href = officialUrl;
    applyLink.target = '_blank';
    applyLink.rel = 'noopener noreferrer';
    applyLink.removeAttribute('aria-disabled');
    applyLink.classList.remove('disabled');
    applyLink.dataset.officialApply = 'true';
    applyLink.title = '打开公司官方校招/招聘页面';
  }
}

function installApplyLinkGuard() {
  enforceOfficialApplyLinks(document);
  const observer = new MutationObserver(() => enforceOfficialApplyLinks(document));
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installApplyLinkGuard, { once: true });
  else installApplyLinkGuard();
}
