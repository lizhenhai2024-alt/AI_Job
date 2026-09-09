import { companyRiskHistory, companyRiskMethodology } from '../data/company-risk-history.js';
import { priorityCompanyRiskHistory } from '../data/company-risk-history-priority.js';

export const mergedCompanyRiskHistory = [...companyRiskHistory, ...priorityCompanyRiskHistory];

function key(value = '') {
  return String(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|集团|控股|中国/gi, '')
    .replace(/[\s·,.，、_-]/g, '')
    .toLowerCase();
}

function matches(left, right) {
  const a = key(left);
  const b = key(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export function riskTypeLabel(type = '') {
  return ({
    layoff: '裁员/优化',
    restructuring: '组织重组/人员调整',
    intern_conversion: '实习转正/留用风险',
    offer_change: '校招毁约/缩招',
    work_intensity: '长期加班/工作强度争议',
    compensation: '薪资倒挂/调薪争议'
  })[type] || '其他历史事件';
}

export function evidenceLevelLabel(level = '') {
  return companyRiskMethodology.evidenceLevels[level] || '证据等级待核';
}

export function validateRiskEvent(event = {}) {
  const reasons = [];
  if (!event.id) reasons.push('缺少事件ID');
  if (!event.type) reasons.push('缺少事件类型');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event.date || ''))) reasons.push('缺少有效发生日期');
  if (!event.title) reasons.push('缺少事件标题');
  if (!event.source) reasons.push('缺少来源名称');
  if (!/^https?:\/\//i.test(String(event.sourceUrl || ''))) reasons.push('缺少可追溯来源链接');
  if (!['A', 'B', 'C', 'D'].includes(String(event.evidenceLevel || ''))) reasons.push('缺少有效证据等级');
  return { valid: reasons.length === 0, reasons };
}

export function companyRiskProfile(company = '') {
  return mergedCompanyRiskHistory.find((profile) =>
    matches(profile.company, company) || (profile.aliases || []).some((alias) => matches(alias, company))
  ) || null;
}

export function companyRiskSummary(company = '') {
  const profile = companyRiskProfile(company);
  const allEvents = profile?.events || [];
  const invalidEvents = allEvents.filter((event) => !validateRiskEvent(event).valid);
  const events = allEvents
    .filter((event) => validateRiskEvent(event).valid)
    .filter((event) => event.evidenceLevel !== 'D')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const highConfidence = events.filter((event) => ['A', 'B'].includes(event.evidenceLevel));
  const community = events.filter((event) => event.evidenceLevel === 'C');
  const negative = events.filter((event) => event.sentiment === 'negative');
  const internConversion = events.filter((event) => event.type === 'intern_conversion');
  return {
    company,
    profile,
    events,
    invalidEvents,
    highConfidence,
    community,
    negative,
    internConversion,
    hasData: events.length > 0,
    methodology: companyRiskMethodology
  };
}

export function companyRiskSearchText(company = '') {
  const summary = companyRiskSummary(company);
  return summary.events.map((event) => [
    riskTypeLabel(event.type), event.title, event.summary, event.scope, event.source
  ].filter(Boolean).join(' ')).join(' ');
}
