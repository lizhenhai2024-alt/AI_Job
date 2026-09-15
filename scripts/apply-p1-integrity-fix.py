from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, got {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


# Shared company canonicalization: source discovery.
replace_once(
    'scripts/job-discovery/source-candidates.mjs',
    "const ACTIVE_STATUSES = new Set(['主投', '观察']);",
    "import { canonicalCompanyKey } from '../../src/core/company-normalization.js';\nexport { canonicalCompanyKey };\n\nconst ACTIVE_STATUSES = new Set(['主投', '观察']);"
)
replace_once(
    'scripts/job-discovery/source-candidates.mjs',
    """export function canonicalCompanyKey(value = '') {
  return String(value || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/新能源|科技|技术|动力/gi, '')
    .replace(/[\\s·,.，、【】\\[\\]：:;；&/_-]/g, '')
    .toLowerCase()
    .trim();
}

""",
    ''
)

# Shared company canonicalization: registry.
replace_once(
    'src/data/company-registry.js',
    "import { companySourceSeeds } from './company-source-seeds.js';",
    "import { companySourceSeeds } from './company-source-seeds.js';\nimport { canonicalCompanyKey } from '../core/company-normalization.js';\nexport { canonicalCompanyKey };"
)
replace_once(
    'src/data/company-registry.js',
    """export function canonicalCompanyKey(value = '') {
  return String(value).replace(/^[\\s🔴🟢🔵✅❌⭐★•·]+/u, '').replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/[\\s·,.，、【】\\[\\]：:;；&/_-]/g, '').toLowerCase().trim();
}

""",
    ''
)

# Intake IDs and duplicate checks use exactly the same canonical rule.
replace_once(
    'src/core/company-intake.js',
    "export const COMPANY_INTAKE_MARKER = '<!-- AI_JOB_COMPANY_INTAKE_V1 -->';",
    "import { canonicalCompanyKey } from './company-normalization.js';\n\nexport const COMPANY_INTAKE_MARKER = '<!-- AI_JOB_COMPANY_INTAKE_V1 -->';"
)
replace_once(
    'src/core/company-intake.js',
    """export function canonicalCompanyIntakeKey(value = '') {
  return normalizeCompanyName(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/[\\s·,.，、【】\\[\\]：:;；&/_-]/g, '')
    .toLowerCase();
}""",
    """export function canonicalCompanyIntakeKey(value = '') {
  return canonicalCompanyKey(normalizeCompanyName(value));
}"""
)

# Historical risk matching uses shared canonicalization.
replace_once(
    'src/core/company-risk.js',
    "import { priorityCompanyRiskHistory } from '../data/company-risk-history-priority.js';",
    "import { priorityCompanyRiskHistory } from '../data/company-risk-history-priority.js';\nimport { sameCanonicalCompany } from './company-normalization.js';"
)
replace_once(
    'src/core/company-risk.js',
    """function key(value = '') {
  return String(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|集团|控股|中国/gi, '')
    .replace(/[\\s·,.，、_-]/g, '')
    .toLowerCase();
}

function matches(left, right) {
  const a = key(left);
  const b = key(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}""",
    """function matches(left, right) {
  return sameCanonicalCompany(left, right);
}"""
)

# UI company filtering should not invent a fourth canonicalization rule.
replace_once(
    'src/app.js',
    "import { createCompanyIntake, buildCompanyIntakeIssueUrl } from './core/company-intake.js';",
    "import { createCompanyIntake, buildCompanyIntakeIssueUrl } from './core/company-intake.js';\nimport { sameCanonicalCompany } from './core/company-normalization.js';"
)
replace_once(
    'src/app.js',
    """function companyKey(value = '') {
  return String(value).replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|集团|控股|中国/gi, '').replace(/[\\s·,.，、]/g, '').toLowerCase();
}

function companyMatches(left, right) {
  const a = companyKey(left);
  const b = companyKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}""",
    """function companyMatches(left, right) {
  return sameCanonicalCompany(left, right);
}"""
)

# Repository checks must validate the same matching behavior as runtime.
replace_once(
    'scripts/check.mjs',
    "import { sourceDiscovery } from '../src/data/source-discovery.js';",
    "import { sourceDiscovery } from '../src/data/source-discovery.js';\nimport { sameCanonicalCompany } from '../src/core/company-normalization.js';"
)
replace_once(
    'scripts/check.mjs',
    "'src/core/shortlist.js', 'src/core/company-intake.js', 'src/core/storage.js', 'src/data/jobs.js', 'src/data/live-jobs.js', 'src/data/profile.js',",
    "'src/core/shortlist.js', 'src/core/company-intake.js', 'src/core/company-normalization.js', 'src/core/storage.js', 'src/data/jobs.js', 'src/data/live-jobs.js', 'src/data/profile.js',"
)
replace_once(
    'scripts/check.mjs',
    """const missingRequests = companyRequests.filter((request) => !companyRegistry.some((record) => record.userRequested && (() => {
  const clean = (value) => String(value || '').replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '').replace(/[\\s·,.，、【】\\[\\]：:;；&/_-]/g, '').toLowerCase();
  const a = clean(record.name); const b = clean(request.name);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
})()));""",
    """const missingRequests = companyRequests.filter((request) => !companyRegistry.some((record) =>
  record.userRequested && sameCanonicalCompany(record.name, request.name)
));"""
)
replace_once(
    'scripts/check.mjs',
    """const missingManaged = sourceRegistry.filter((source) => !companyRegistry.some((record) => record.sourceManaged && record.sourceProviders?.includes(source.provider) && (() => {
  const clean = (value) => String(value || '').replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '').replace(/[\\s·,.，、【】\\[\\]：:;；&/_-]/g, '').toLowerCase();
  const a = clean(record.name); const b = clean(source.company);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
})()));""",
    """const missingManaged = sourceRegistry.filter((source) => !companyRegistry.some((record) =>
  record.sourceManaged && record.sourceProviders?.includes(source.provider) && sameCanonicalCompany(record.name, source.company)
));"""
)

print('P1 source patches complete')
