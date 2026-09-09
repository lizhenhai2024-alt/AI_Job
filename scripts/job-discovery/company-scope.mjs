const SEARCH_STATUSES = new Set(['主投', '观察']);
const STATUS_RANK = { '主投': 2, '观察': 1 };

function cleanName(value = '') {
  return String(value || '').trim();
}

export function buildCompanySearchScope(records = []) {
  const seen = new Set();
  const scope = [];
  for (const record of records || []) {
    const name = cleanName(record?.name);
    const status = String(record?.status || '');
    if (!name || !SEARCH_STATUSES.has(status)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    scope.push({
      name,
      status,
      sourceManaged: Boolean(record.sourceManaged),
      sourceProviders: [...(record.sourceProviders || [])],
      userRequested: Boolean(record.userRequested)
    });
  }
  return scope.sort((a, b) => (STATUS_RANK[b.status] - STATUS_RANK[a.status]) || Number(b.userRequested) - Number(a.userRequested) || a.name.localeCompare(b.name, 'zh-CN'));
}

export function augmentSearchProfile(profile = {}, records = []) {
  const scope = buildCompanySearchScope(records);
  const targetCompanies = scope.map((item) => item.name);
  const keywordSet = new Set([...(profile.keywords || []), ...targetCompanies].map((item) => String(item || '').trim()).filter(Boolean));
  return {
    ...profile,
    keywords: [...keywordSet],
    targetCompanies,
    companySearchMeta: {
      total: scope.length,
      main: scope.filter((item) => item.status === '主投').length,
      watch: scope.filter((item) => item.status === '观察').length,
      sourceManaged: scope.filter((item) => item.sourceManaged).length,
      pendingOfficialSource: scope.filter((item) => !item.sourceManaged).length
    }
  };
}
