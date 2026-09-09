import { companyLibrary } from './company-library.js';
import { sourceRegistry } from './source-registry.js';

const CITY_NAMES = new Set(['北京','上海','广州','深圳','杭州','苏州','无锡','长沙','武汉','西安','成都','天津','南京','佛山','东莞','珠海','惠州','厦门','济南','青岛','昆明','长春']);

export function canonicalCompanyKey(value = '') {
  return String(value)
    .replace(/^[\s🔴🟢🔵✅❌⭐★•·]+/u, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|科技股份|集团|控股|中国|app/gi, '')
    .replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '')
    .toLowerCase()
    .trim();
}

export function isValidCompanyRecord(record) {
  const name = String(record?.name || '').trim();
  if (!name || name.length > 40 || CITY_NAMES.has(name)) return false;
  if (/^(?:\d+|[0-9️⃣🔟①②③④⑤⑥⑦⑧⑨⑩]+)$/u.test(name)) return false;
  return /[A-Za-z\u4e00-\u9fff]/u.test(name);
}

function findMatch(records, name) {
  const key = canonicalCompanyKey(name);
  if (!key) return null;
  return records.find((record) => {
    const candidate = canonicalCompanyKey(record.name);
    if (!candidate) return false;
    if (candidate === key) return true;
    const minLength = Math.min(candidate.length, key.length);
    return minLength >= 3 && (candidate.includes(key) || key.includes(candidate));
  }) || null;
}

export function buildCompanyRegistry(library = companyLibrary, sources = sourceRegistry) {
  const records = library
    .filter(isValidCompanyRecord)
    .map((record) => ({
      ...record,
      // Only numbered master-list category rows are authoritative for industry.
      // Older generated files leaked the final industry into observation rows.
      industries: record.status === '主投' ? [...(record.industries || [])] : [],
      cities: [...(record.cities || [])],
      targetTracks: [...(record.targetTracks || [])],
      sourceProviders: [],
      sourceManaged: false
    }));

  for (const source of sources) {
    let record = findMatch(records, source.company);
    if (!record) {
      record = {
        name: source.company,
        status: '观察',
        industries: [],
        cities: [],
        targetTracks: [],
        evidence: { count: 0 },
        sourceProviders: [],
        sourceManaged: true
      };
      records.push(record);
    }
    record.sourceManaged = true;
    if (!record.sourceProviders.includes(source.provider)) record.sourceProviders.push(source.provider);
  }

  return records;
}

export const companyRegistry = buildCompanyRegistry();

// Keep the existing app API stable: app.js already imports companyLibrary.
// Mutate that shared array in place so the UI receives the cleaned, unified
// registry without duplicating company state in another frontend store.
companyLibrary.splice(0, companyLibrary.length, ...companyRegistry);
