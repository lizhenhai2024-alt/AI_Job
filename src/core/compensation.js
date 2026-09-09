const MONEY_RANGE_SEP = String.raw`(?:-|~|～|—|–|至|到)`;

function n(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}

function round(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function clipSnippet(text = '', match = '') {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const needle = String(match || '').trim();
  if (!needle) return raw.slice(0, 160);
  const idx = raw.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle.slice(0, 160);
  return raw.slice(Math.max(0, idx - 28), Math.min(raw.length, idx + needle.length + 28));
}

function displayMonthly(min, max, { estimated = false } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '未披露';
  const fmt = (v) => v >= 10000 ? `${round(v / 10000, 2)}万` : `${round(v / 1000, 1)}k`;
  const range = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return `${range}/月${estimated ? '（估算）' : ''}`;
}

function displayAnnual(min, max, { estimated = false, months = null } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '未披露';
  const fmt = (v) => `${round(v / 10000, 2)}万`;
  const range = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  const suffix = estimated ? `（${months ? `按${months}薪` : '按12薪'}推算）` : '';
  return `${range}/年${suffix}`;
}

function salaryText(job = {}) {
  const values = [];
  const push = (value) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number') values.push(String(value));
    else if (Array.isArray(value)) value.forEach(push);
    else if (typeof value === 'object') values.push(JSON.stringify(value));
  };
  push(job.salary);
  push(job._searchText);
  push(job.description);
  return values.filter(Boolean).join('\n');
}

function parseStructuredSalary(value) {
  if (!value || typeof value !== 'object') return null;
  const root = value.value && typeof value.value === 'object' ? value.value : value;
  const min = n(root.minValue ?? root.min ?? root.value);
  const max = n(root.maxValue ?? root.max ?? root.value);
  if (min == null || max == null || min <= 0 || max <= 0) return null;
  const unitRaw = String(root.unitText || value.unitText || root.unit || value.unit || '').toUpperCase();
  const multiplier = /YEAR|ANNUAL|年/.test(unitRaw) ? 'annual' : /MONTH|月/.test(unitRaw) ? 'monthly' : null;
  if (!multiplier) return null;
  return { min: Math.min(min, max), max: Math.max(min, max), unit: multiplier, match: JSON.stringify(value) };
}

function parseJsonStringSalary(text = '') {
  const raw = String(text || '');
  if (!/["']?(?:minValue|maxValue|unitText)["']?\s*:/.test(raw)) return null;
  const minMatch = raw.match(/["']?minValue["']?\s*:\s*["']?(\d+(?:\.\d+)?)/i);
  const maxMatch = raw.match(/["']?maxValue["']?\s*:\s*["']?(\d+(?:\.\d+)?)/i);
  const unitMatch = raw.match(/["']?unitText["']?\s*:\s*["']([^"']+)/i);
  const min = n(minMatch?.[1]);
  const max = n(maxMatch?.[1]);
  if (min == null || max == null) return null;
  const unitRaw = String(unitMatch?.[1] || '').toUpperCase();
  const unit = /YEAR|ANNUAL|年/.test(unitRaw) ? 'annual' : /MONTH|月/.test(unitRaw) ? 'monthly' : null;
  if (!unit) return null;
  return { min: Math.min(min, max), max: Math.max(min, max), unit, match: [minMatch?.[0], maxMatch?.[0], unitMatch?.[0]].filter(Boolean).join(' ') };
}

function parseAnnualWan(text = '') {
  const rx = new RegExp(`(?:年薪|年收入|年度总包|年包|年薪资|package|total\\s*compensation)[^\\d]{0,16}(\\d+(?:\\.\\d+)?)\\s*${MONEY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:万|w|W)(?:\\s*元)?`, 'i');
  const m = String(text).match(rx);
  if (!m) return null;
  const min = n(m[1]);
  const max = n(m[2]);
  if (min == null || max == null) return null;
  return { min: Math.min(min, max) * 10000, max: Math.max(min, max) * 10000, match: m[0] };
}

function parseMonthlyK(text = '') {
  const rx = new RegExp(`(?:月薪|薪资范围|薪酬|薪资|base\\s*salary)?[^\\d]{0,10}(\\d+(?:\\.\\d+)?)\\s*(?:k|K|千)\\s*${MONEY_RANGE_SEP}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:k|K|千)(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?`, 'i');
  const m = String(text).match(rx);
  if (!m) return null;
  const min = n(m[1]);
  const max = n(m[2]);
  const months = n(m[3]);
  if (min == null || max == null || min <= 0 || max > 500) return null;
  return { min: Math.min(min, max) * 1000, max: Math.max(min, max) * 1000, months, match: m[0] };
}

function parseMonthlyYuan(text = '', strictSalaryField = false) {
  const patterns = [
    new RegExp(`(?:月薪|薪资范围|薪酬|薪资)[^\\d]{0,10}(\\d{4,6})\\s*${MONEY_RANGE_SEP}\\s*(\\d{4,6})\\s*(?:元)?\\s*(?:/|每)?\\s*(?:月|个月)?(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?`, 'i'),
    strictSalaryField ? new RegExp(`^\\s*(\\d{4,6})\\s*${MONEY_RANGE_SEP}\\s*(\\d{4,6})(?:\\s*(?:元)?(?:/月)?)?(?:\\s*(?:[·xX×*]|\\+)\\s*(\\d{1,2})\\s*薪)?\\s*$`, 'i') : null
  ].filter(Boolean);
  for (const rx of patterns) {
    const m = String(text).match(rx);
    if (!m) continue;
    const min = n(m[1]);
    const max = n(m[2]);
    const months = n(m[3]);
    if (min == null || max == null || min < 1000 || max > 200000) continue;
    return { min: Math.min(min, max), max: Math.max(min, max), months, match: m[0] };
  }
  return null;
}

function parseSingleMonthlyK(text = '') {
  const m = String(text).match(/(?:月薪|薪资范围|薪酬|薪资)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:k|K|千)(?:\s*(?:[·xX×*]|\+)\s*(\d{1,2})\s*薪)?/i);
  if (!m) return null;
  const value = n(m[1]);
  const months = n(m[2]);
  if (value == null || value <= 0 || value > 500) return null;
  return { min: value * 1000, max: value * 1000, months, match: m[0] };
}

export function normalizeCompensation(job = {}) {
  const rawSalary = typeof job.salary === 'string' ? job.salary.trim() : job.salary ? JSON.stringify(job.salary) : '';
  const text = salaryText(job);
  const structured = parseStructuredSalary(job.salary) || parseJsonStringSalary(rawSalary);
  const explicitAnnual = structured?.unit === 'annual'
    ? { min: structured.min, max: structured.max, match: structured.match }
    : parseAnnualWan(text);
  const monthly = structured?.unit === 'monthly'
    ? { min: structured.min, max: structured.max, months: null, match: structured.match }
    : parseMonthlyK(text)
      || parseMonthlyYuan(rawSalary, true)
      || parseMonthlyYuan(text, false)
      || parseSingleMonthlyK(text);

  let monthlyMin = monthly?.min ?? null;
  let monthlyMax = monthly?.max ?? null;
  let annualMin = explicitAnnual?.min ?? null;
  let annualMax = explicitAnnual?.max ?? null;
  const months = monthly?.months && monthly.months >= 12 && monthly.months <= 24 ? monthly.months : null;
  let monthlyEstimated = false;
  let annualEstimated = false;
  let annualMonths = months;

  if (monthlyMin != null && annualMin == null) {
    annualMonths = months || 12;
    annualMin = monthlyMin * annualMonths;
    annualMax = monthlyMax * annualMonths;
    annualEstimated = true;
  }
  if (annualMin != null && monthlyMin == null) {
    monthlyMin = annualMin / 12;
    monthlyMax = annualMax / 12;
    monthlyEstimated = true;
  }

  const disclosed = monthlyMin != null || annualMin != null;
  const official = job.sourceType === 'official';
  const evidenceMatch = explicitAnnual?.match || monthly?.match || rawSalary;
  const sourceLabel = official ? '企业官方JD/ATS' : job.sourceType === 'secondary' ? '二手岗位来源，待官网复核' : '岗位来源';
  const confidence = disclosed ? (official ? 'high' : 'medium') : 'none';

  return {
    disclosed,
    raw: rawSalary || '',
    monthlyMin: monthlyMin == null ? null : Math.round(monthlyMin),
    monthlyMax: monthlyMax == null ? null : Math.round(monthlyMax),
    annualMin: annualMin == null ? null : Math.round(annualMin),
    annualMax: annualMax == null ? null : Math.round(annualMax),
    salaryMonths: annualMonths,
    monthlyEstimated,
    annualEstimated,
    monthlyDisplay: displayMonthly(monthlyMin, monthlyMax, { estimated: monthlyEstimated }),
    annualDisplay: displayAnnual(annualMin, annualMax, { estimated: annualEstimated, months: annualMonths }),
    sourceLabel,
    confidence,
    evidence: disclosed ? clipSnippet(text, evidenceMatch) : (rawSalary || '').slice(0, 160)
  };
}

export function enrichJobCompensation(job = {}) {
  const compensation = normalizeCompensation(job);
  return {
    ...job,
    compensation,
    monthlySalary: compensation.monthlyDisplay,
    annualSalary: compensation.annualDisplay
  };
}
