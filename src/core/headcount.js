// 岗位 HC / 发布日期标准化。
// 原则：只使用来源页/JD明确披露的信息；不根据公司规模、岗位数量或 discoveredAt 猜测。

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function n(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}

function normalizeDate(value = '') {
  if (!value) return '';
  const raw = String(value);
  const m = raw.match(/(20\d{2})[-年\/.](\d{1,2})[-月\/.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function sourceLabel(job = {}) {
  return job.sourceType === 'official'
    ? '企业官方JD/ATS'
    : job.sourceType === 'secondary'
      ? '二手岗位来源，待官网复核'
      : '岗位来源';
}

function clipSnippet(text = '', match = '') {
  const raw = clean(text);
  if (!raw) return '';
  const needle = clean(match);
  if (!needle) return raw.slice(0, 180);
  const idx = raw.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle.slice(0, 180);
  return raw.slice(Math.max(0, idx - 36), Math.min(raw.length, idx + needle.length + 44));
}

function textForHeadcount(job = {}) {
  return [
    job.headcountRaw,
    job.headCount,
    job.HeadCount,
    job.recruitCount,
    job.recruitNumber,
    job.hiringCount,
    job.jobDescription,
    job.jobRequirements,
    job.description,
    job._searchText
  ].filter((v) => v != null && v !== '').map(clean).join('\n');
}

function structuredHeadcount(job = {}) {
  const candidates = [job.headcountRaw, job.headCount, job.HeadCount, job.recruitCount, job.recruitNumber, job.hiringCount];
  for (const rawValue of candidates) {
    if (rawValue == null || rawValue === '') continue;
    if (typeof rawValue === 'number') {
      const value = n(rawValue);
      if (value != null && value > 0 && value <= 100000) {
        return { min: Math.round(value), max: Math.round(value), scope: 'job', match: String(rawValue) };
      }
      continue;
    }
    const raw = clean(rawValue);
    let m = raw.match(/^(\d{1,6})\s*(?:人|名|个)?$/);
    if (m) {
      const value = n(m[1]);
      if (value != null && value > 0 && value <= 100000) return { min: value, max: value, scope: 'job', match: raw };
    }
    m = raw.match(/^(\d{1,6})\s*(?:-|~|～|—|–|至|到)\s*(\d{1,6})\s*(?:人|名|个)?$/);
    if (m) {
      const a = n(m[1]), b = n(m[2]);
      if (a != null && b != null && a > 0 && b >= a && b <= 100000) return { min: a, max: b, scope: 'job', match: raw };
    }
  }
  return null;
}

function inferScope(context = '') {
  const s = clean(context);
  // 明确“本岗位/职位/该岗”优先认定为岗位级；否则带整体校招语义的数字只作为项目规模。
  if (/本岗位|本职位|该岗位|该职位|岗位(?:招聘|需求|计划)?人数|职位(?:招聘|需求|计划)?人数/.test(s)) return 'job';
  if (/校招|校园招聘|秋招|春招|本届|整体|全国|总计|合计|共计|总人数|招聘规模|招聘计划/.test(s)) return 'program';
  return 'job';
}

function parseTextHeadcount(text = '') {
  const raw = clean(text);
  if (!raw) return null;
  const patterns = [
    /(?:本岗位|本职位|该岗位|该职位)?\s*(?:招聘人数|需求人数|招聘名额|需求名额|岗位名额|职位名额|招聘HC|岗位HC|HC|head\s*count|headcount)\s*[:：]?\s*(\d{1,6})\s*(?:-|~|～|—|–|至|到)\s*(\d{1,6})\s*(?:人|名|个)?/i,
    /(?:本岗位|本职位|该岗位|该职位)?\s*(?:招聘人数|需求人数|招聘名额|需求名额|岗位名额|职位名额|招聘HC|岗位HC|HC|head\s*count|headcount)\s*[:：]?\s*(\d{1,6})\s*(?:人|名|个)/i,
    /(?:计划|预计|拟|共|合计|总计)?\s*招聘\s*(\d{1,6})\s*(?:-|~|～|—|–|至|到)\s*(\d{1,6})\s*(?:人|名)(?:左右)?/i,
    /(?:计划|预计|拟|共|合计|总计)?\s*招聘\s*(\d{1,6})\s*(?:人|名)(?:左右)?/i
  ];
  for (const rx of patterns) {
    const m = raw.match(rx);
    if (!m) continue;
    const a = n(m[1]);
    const b = n(m[2] ?? m[1]);
    if (a == null || b == null || a <= 0 || b < a || b > 100000) continue;
    const idx = m.index ?? raw.indexOf(m[0]);
    const context = raw.slice(Math.max(0, idx - 48), Math.min(raw.length, idx + m[0].length + 48));
    return { min: Math.round(a), max: Math.round(b), scope: inferScope(context), match: m[0], context };
  }
  return null;
}

function displayRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '未披露';
  return min === max ? `${min}人` : `${min}–${max}人`;
}

export function normalizeHeadcount(job = {}) {
  const text = textForHeadcount(job);
  const parsed = structuredHeadcount(job) || parseTextHeadcount(text);
  const disclosed = Boolean(parsed);
  const official = job.sourceType === 'official';
  return {
    disclosed,
    raw: clean(job.headcountRaw ?? job.headCount ?? job.HeadCount ?? job.recruitCount ?? job.recruitNumber ?? job.hiringCount ?? ''),
    min: disclosed ? parsed.min : null,
    max: disclosed ? parsed.max : null,
    scope: disclosed ? parsed.scope : '',
    display: disclosed ? displayRange(parsed.min, parsed.max) : '未披露',
    sourceLabel: sourceLabel(job),
    confidence: disclosed ? (official ? 'high' : 'medium') : 'none',
    evidence: disclosed ? clipSnippet(text, parsed.match) : ''
  };
}

export function normalizePublishedAt(job = {}) {
  // publishedAt 必须是“来源发布日”；discoveredAt / firstSeen 只是系统发现时间，不能冒充发布日期。
  for (const value of [job.publishedAt, job.datePosted, job.publishDate, job.publishedDate, job.postDate, job.PostDate]) {
    const out = normalizeDate(value);
    if (out) return out;
  }
  return '';
}

export function enrichJobHeadcount(job = {}) {
  const headcount = normalizeHeadcount(job);
  return {
    ...job,
    publishedAt: normalizePublishedAt(job),
    headcount,
    headcountDisplay: headcount.display,
    headcountScope: headcount.scope
  };
}
