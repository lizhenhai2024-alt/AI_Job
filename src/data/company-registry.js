import { companyLibrary } from './company-library.js';
import { sourceRegistry } from './source-registry.js';
import { companyRequests } from './company-requests.js';
import { sourceDiscovery } from './source-discovery.js';

const CITY_NAMES = ['北京','上海','广州','深圳','杭州','苏州','无锡','长沙','武汉','西安','成都','天津','南京','佛山','东莞','珠海','惠州','厦门','济南','青岛','昆明','长春','宁波','合肥','郑州','重庆','青岛','大连','沈阳','福州','南昌','南宁'];
const CITY_SET = new Set(CITY_NAMES);
const TRACK_HINT = /(市场|营销|品牌|运营|商务|客户|HR|人力|供应链|采购|财务|咨询|审计|法务|销售支持|客户成功|产品|项目管理|国际业务|跨境|电商|海外|GTM|物流)/i;

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
  if (!name || name.length > 80 || CITY_SET.has(name)) return false;
  if (/^(?:\d+|[0-9️⃣🔟①②③④⑤⑥⑦⑧⑨⑩]+)$/u.test(name)) return false;
  return /[A-Za-z\u4e00-\u9fff]/u.test(name);
}

export function normalizeCities(values = []) {
  const found = [];
  for (const value of values || []) {
    const text = String(value || '');
    for (const city of CITY_NAMES) {
      if (text.includes(city) && !found.includes(city)) found.push(city);
    }
  }
  return found;
}

export function normalizeTracks(targetTracks = [], legacyCities = []) {
  const tracks = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text || !TRACK_HINT.test(text)) return;
    for (const part of text.split(/[\/、，,]/).map((item) => item.trim()).filter(Boolean)) {
      if (TRACK_HINT.test(part) && !tracks.includes(part)) tracks.push(part);
    }
  };
  for (const value of targetTracks || []) add(value);
  for (const value of legacyCities || []) add(value);
  return tracks;
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

export function buildCompanyRegistry(library = companyLibrary, sources = sourceRegistry, requests = companyRequests, discoveries = sourceDiscovery) {
  const records = library
    .filter(isValidCompanyRecord)
    .map((record) => {
      const legacyCities = [...(record.cities || [])];
      return {
        ...record,
        industries: record.status === '主投' ? [...(record.industries || [])] : [],
        cities: normalizeCities(legacyCities),
        targetTracks: normalizeTracks(record.targetTracks || [], legacyCities),
        sourceProviders: [],
        sourceManaged: false,
        sourceDiscoveryState: 'queued',
        sourceDiscoveryReason: '',
        sourceDiscoveryUrl: '',
        sourceDiscoveryCheckedAt: '',
        userRequested: false
      };
    });

  for (const request of requests || []) {
    if (!isValidCompanyRecord({ name: request?.name })) continue;
    let record = findMatch(records, request.name);
    if (!record) {
      record = {
        name: request.name,
        status: '观察',
        industries: [],
        cities: [],
        targetTracks: [],
        evidence: { count: 0 },
        sourceProviders: [],
        sourceManaged: false,
        sourceDiscoveryState: 'queued',
        sourceDiscoveryReason: '',
        sourceDiscoveryUrl: '',
        sourceDiscoveryCheckedAt: ''
      };
      records.push(record);
    }
    record.userRequested = true;
    record.intakeStatus = request.status || '待分析';
    record.intakeProvider = request.provider || '';
    record.intakeAnalysis = request.analysis || '';
    record.careerUrl = request.careerUrl || record.careerUrl || '';
    record.intakeIssueUrl = request.issueUrl || '';
    record.requestedAt = request.requestedAt || '';
    record.targetTracks = [...new Set([...(record.targetTracks || []), ...normalizeTracks(request.focus || [])])];
  }

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
        sourceManaged: true,
        sourceDiscoveryState: 'official_source',
        sourceDiscoveryReason: '',
        sourceDiscoveryUrl: '',
        sourceDiscoveryCheckedAt: '',
        userRequested: false
      };
      records.push(record);
    }
    record.sourceManaged = true;
    record.sourceDiscoveryState = 'official_source';
    if (!record.sourceProviders.includes(source.provider)) record.sourceProviders.push(source.provider);
    if (record.userRequested && /等待岗位刷新|官方源已存在/.test(record.intakeStatus || '')) {
      record.intakeStatus = '官方源已接入';
    }
  }

  for (const discovery of discoveries || []) {
    if (!discovery?.name) continue;
    const record = findMatch(records, discovery.name);
    if (!record) continue;
    record.sourceDiscoveryState = record.sourceManaged ? 'official_source' : (discovery.state || 'queued');
    record.sourceDiscoveryProvider = discovery.provider || '';
    record.sourceDiscoveryReason = discovery.reason || '';
    record.sourceDiscoveryUrl = discovery.officialUrl || '';
    record.sourceDiscoveryCheckedAt = discovery.lastCheckedAt || '';
    record.sourceDiscoveryNextCheck = discovery.nextCheckAfter || '';
    record.sourceDiscoveryAttempts = Number(discovery.attempts || 0);
  }

  return records;
}

export const companyRegistry = buildCompanyRegistry();
companyLibrary.splice(0, companyLibrary.length, ...companyRegistry);
