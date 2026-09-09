import { companyLibrary as rawCompanyLibrary, companyLibraryMeta as rawMeta } from './company-library-raw.js';

const CITY_NAMES = ['北京','上海','广州','深圳','杭州','苏州','无锡','长沙','武汉','西安','成都','天津','南京','佛山','东莞','珠海','惠州','厦门','济南','青岛','昆明','长春','宁波','合肥','郑州','重庆','大连','沈阳','福州','南昌','南宁'];
const CITY_SET = new Set(CITY_NAMES);
const TRACK_HINT = /(市场|营销|品牌|运营|商务|客户|HR|人力|供应链|采购|财务|咨询|审计|法务|销售支持|客户成功|产品|项目管理|国际业务|跨境|电商)/i;

function validCompanyName(value = '') {
  const name = String(value).trim();
  if (!name || name.length > 40 || CITY_SET.has(name)) return false;
  if (/^(?:\d+|[0-9️⃣🔟①②③④⑤⑥⑦⑧⑨⑩]+)$/u.test(name)) return false;
  return /[A-Za-z\u4e00-\u9fff]/u.test(name);
}

function normalizeCities(values = []) {
  const out = [];
  for (const value of values || []) {
    const text = String(value || '');
    for (const city of CITY_NAMES) if (text.includes(city) && !out.includes(city)) out.push(city);
  }
  return out;
}

function normalizeTracks(targetTracks = [], legacyCities = []) {
  const out = [];
  for (const value of [...(targetTracks || []), ...(legacyCities || [])]) {
    for (const part of String(value || '').split(/[\/、，,]/).map((item) => item.trim()).filter(Boolean)) {
      if (TRACK_HINT.test(part) && !out.includes(part)) out.push(part);
    }
  }
  return out;
}

export const companyLibrary = rawCompanyLibrary
  .filter((record) => validCompanyName(record?.name))
  .map((record) => {
    const legacyCities = [...(record.cities || [])];
    return {
      ...record,
      // Only the authoritative main pool keeps imported industry taxonomy.
      // Historical observation/risk rows suffered from stale-category leakage.
      industries: record.status === '主投' ? [...(record.industries || [])] : [],
      cities: normalizeCities(legacyCities),
      targetTracks: normalizeTracks(record.targetTracks || [], legacyCities)
    };
  });

export const companyLibraryMeta = {
  ...rawMeta,
  sanitized: true,
  counts: Object.fromEntries(['主投','观察','风险','移出'].map((status) => [status, companyLibrary.filter((item) => item.status === status).length]))
};
