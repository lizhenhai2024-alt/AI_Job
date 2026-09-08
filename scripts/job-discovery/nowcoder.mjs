import { parseJobPage, shouldKeep, dedupeJobs } from './core.mjs';

const DEFAULT_UA = 'AI-Job/0.2 (+https://github.com/lizhenhai2024-alt/AI_Job; public-campus-job-indexer)';

export async function fetchText(url, { timeoutMs = 15000, userAgent = DEFAULT_UA } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseSitemap(xml = '') {
  const entries = [];
  const blocks = [...String(xml).matchAll(/<(url|sitemap)>[\s\S]*?<\/\1>/gi)];
  for (const [block] of blocks) {
    const loc = ((block.match(/<loc>([\s\S]*?)<\/loc>/i) || [,''])[1] || '').trim().replace(/&amp;/g,'&');
    if (!loc) continue;
    const lastmod = ((block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i) || [,''])[1] || '').trim();
    entries.push({ loc, lastmod, kind: /<sitemap>/i.test(block) ? 'sitemap' : 'url' });
  }
  return entries;
}

export function parseRobotsSitemaps(text = '') {
  return String(text).split(/\r?\n/).map((line) => line.match(/^\s*Sitemap:\s*(\S+)/i)?.[1]).filter(Boolean);
}

function jobUrlsFromHtml(html = '', base = 'https://www.nowcoder.com') {
  const refs = [...String(html).matchAll(/(?:https?:\/\/www\.nowcoder\.com)?\/jobs\/detail\/\d+/g)].map((m) => m[0]);
  return [...new Set(refs.map((ref) => new URL(ref, base).href))];
}

export async function discoverJobUrls({ fetcher = fetchText, maxSitemaps = 20, maxCandidates = 500 } = {}) {
  const roots = [];
  try {
    const robots = await fetcher('https://www.nowcoder.com/robots.txt');
    roots.push(...parseRobotsSitemaps(robots));
  } catch {}
  if (!roots.length) roots.push('https://www.nowcoder.com/sitemap.xml');

  const queue = [...new Set(roots)];
  const seen = new Set();
  const jobs = new Map();

  while (queue.length && seen.size < maxSitemaps && jobs.size < maxCandidates) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const xml = await fetcher(sitemapUrl);
      for (const entry of parseSitemap(xml)) {
        if (/\/jobs\/detail\/\d+/.test(entry.loc)) {
          jobs.set(entry.loc, entry.lastmod || jobs.get(entry.loc) || '');
        } else if (entry.kind === 'sitemap' || /sitemap.*\.xml/i.test(entry.loc)) {
          if (!seen.has(entry.loc) && queue.length < maxSitemaps * 3) queue.push(entry.loc);
        }
        if (jobs.size >= maxCandidates) break;
      }
    } catch {}
  }

  if (!jobs.size) {
    for (const landing of ['https://www.nowcoder.com/jobs/recommend/campus','https://www.nowcoder.com/jobs/school/schedule?tab=1']) {
      try {
        const html = await fetcher(landing);
        for (const url of jobUrlsFromHtml(html)) jobs.set(url, '');
      } catch {}
    }
  }

  return [...jobs.entries()].map(([url,lastmod]) => ({ url, lastmod }));
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      try { out[current] = await mapper(items[current], current); }
      catch (error) { out[current] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return out;
}

export async function searchNowcoderJobs(profile, {
  fetcher = fetchText,
  maxCandidates = profile.maxCandidates || 500,
  maxPages = profile.maxPages || 120,
  concurrency = profile.concurrency || 4,
  now = new Date()
} = {}) {
  const discovered = await discoverJobUrls({ fetcher, maxCandidates });
  const sorted = discovered.sort((a,b) => String(b.lastmod).localeCompare(String(a.lastmod))).slice(0, maxPages);
  const results = await mapLimit(sorted, concurrency, async ({ url, lastmod }) => {
    const html = await fetcher(url);
    const job = parseJobPage({ html, url, lastmod, now });
    return shouldKeep(job, profile, now) ? job : null;
  });
  const jobs = dedupeJobs(results.filter((x) => x && !x.error));
  return { jobs, stats: { discoveredUrls: discovered.length, scannedPages: sorted.length, keptJobs: jobs.length, errors: results.filter((x) => x?.error).length } };
}
