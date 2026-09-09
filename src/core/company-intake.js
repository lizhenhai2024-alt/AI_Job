export const COMPANY_INTAKE_MARKER = '<!-- AI_JOB_COMPANY_INTAKE_V1 -->';
export const COMPANY_INTAKE_REPO = 'lizhenhai2024-alt/AI_Job';

export function normalizeCompanyName(value = '') {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function canonicalCompanyIntakeKey(value = '') {
  return normalizeCompanyName(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '')
    .toLowerCase();
}

export function normalizeCareerUrl(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeFocus(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[、,，\n]/);
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
}

export function createCompanyIntake(input = {}, now = new Date()) {
  const name = normalizeCompanyName(input.name);
  if (!name) throw new Error('公司名称不能为空');
  const careerUrl = normalizeCareerUrl(input.careerUrl);
  const requestedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const key = canonicalCompanyIntakeKey(name);
  return {
    id: `local-${key || 'company'}-${requestedAt.slice(0, 19).replace(/\D/g, '')}`,
    key,
    name,
    careerUrl,
    focus: normalizeFocus(input.focus),
    note: String(input.note || '').trim().slice(0, 500),
    requestedAt,
    status: '待提交分析',
    localOnly: true
  };
}

export function buildCompanyIntakeIssueBody(request = {}) {
  const focus = normalizeFocus(request.focus).join('、');
  return [
    COMPANY_INTAKE_MARKER,
    `company: ${normalizeCompanyName(request.name)}`,
    `career_url: ${normalizeCareerUrl(request.careerUrl)}`,
    `focus: ${focus}`,
    `note: ${String(request.note || '').replace(/\r?\n/g, ' ').trim().slice(0, 500)}`,
    '',
    '请保留以上机器可读字段。Actions 将尝试识别官方招聘系统、核验 2027 届证据并抓取岗位。'
  ].join('\n');
}

export function buildCompanyIntakeIssueUrl(request = {}, repository = COMPANY_INTAKE_REPO) {
  const title = `[Company Intake] ${normalizeCompanyName(request.name)}`;
  const body = buildCompanyIntakeIssueBody(request);
  const params = new URLSearchParams({ title, body });
  return `https://github.com/${repository}/issues/new?${params.toString()}`;
}
