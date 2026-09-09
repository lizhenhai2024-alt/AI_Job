import { companyRiskHistory, companyRiskMethodology } from '../data/company-risk-history.js';

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
    layoff: '裁员/人员优化',
    restructuring: '组织重组',
    intern_conversion: '实习转正/留用',
    offer_change: '校招毁约/缩招',
    work_intensity: '工作强度争议',
    compensation: '薪酬争议'
  })[type] || '其他历史事件';
}

export function evidenceLevelLabel(level = '') {
  return companyRiskMethodology.evidenceLevels[level] || '证据等级待核';
}

export function companyRiskProfile(company = '') {
  return companyRiskHistory.find((profile) =>
    matches(profile.company, company) || (profile.aliases || []).some((alias) => matches(alias, company))
  ) || null;
}

export function companyRiskSummary(company = '') {
  const profile = companyRiskProfile(company);
  const events = (profile?.events || [])
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
