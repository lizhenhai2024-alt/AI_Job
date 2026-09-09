import { companyLibrary } from './company-library.js';
import { sourceRegistry } from './source-registry.js';
import { companyRequests } from './company-requests.js';
import { sourceDiscovery } from './source-discovery.js';
import { sourceHealth } from './source-health.js';

const CITY_NAMES = ['北京','上海','广州','深圳','杭州','苏州','无锡','长沙','武汉','西安','成都','天津','南京','佛山','东莞','珠海','惠州','厦门','济南','青岛','昆明','长春','宁波','合肥','郑州','重庆','青岛','大连','沈阳','福州','南昌','南宁'];
const CITY_SET = new Set(CITY_NAMES);
const TRACK_HINT = /(市场|营销|品牌|运营|商务|客户|HR|人力|供应链|采购|财务|咨询|审计|法务|销售支持|客户成功|产品|项目管理|国际业务|跨境|电商|海外|GTM|物流)/i;
const DISCOVERY_LABELS = {
  queued: '待发现官方招聘入口',
  not_found: '本轮未找到官网，待重试',
  candidate_found: '找到候选招聘入口，待复核',
  candidate_rejected: '候选入口身份不充分，待重试',
  no_2027_evidence: '找到招聘入口，暂无2027证据',
  needs_adapter: '找到官方招聘页，待适配抓取器',
  search_error: '来源发现异常，待自动重试',
  source_registered: '官方源已识别，等待岗位刷新',
  official_source: '官方源已接入'
};
const HEALTH_LABELS = {
  healthy: '官方源正常',
  error: '官方源抓取异常',
  empty: '官方源当前无岗位/需检查',
  no_2027: '官方源未识别到2027届',
  no_formal_2027: '官方源没有2027正式岗，需换入口',
  broad_scope: '官方源范围过宽，需定位2027专属入口',
  unknown: '官方源健康状态待核'
};

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

export function buildCompanyRegistry(library = companyLibrary, sources = sourceRegistry, requests = companyRequests, discoveries = sourceDiscovery, health = sourceHealth) {
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
        sourceHealthStatus: '',
        sourceHealthReason: '',
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
        industries: [], cities: [], targetTracks: [], evidence: { count: 0 },
        sourceProviders: [], sourceManaged: false, sourceDiscoveryState: 'queued', sourceDiscoveryReason: '',
        sourceDiscoveryUrl: '', sourceDiscoveryCheckedAt: '', sourceHealthStatus: '', sourceHealthReason: ''
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
        name: source.company, status: '观察', industries: [], cities: [], targetTracks: [], evidence: { count: 0 },
        sourceProviders: [], sourceManaged: true, sourceDiscoveryState: 'official_source', sourceDiscoveryReason: '',
        sourceDiscoveryUrl: '', sourceDiscoveryCheckedAt: '', sourceHealthStatus: '', sourceHealthReason: '', userRequested: false
      };
      records.push(record);
    }
    record.sourceManaged = true;
    record.sourceDiscoveryState = 'official_source';
    if (!record.sourceProviders.includes(source.provider)) record.sourceProviders.push(source.provider);
    if (record.userRequested && /等待岗位刷新|官方源已存在/.test(record.intakeStatus || '')) record.intakeStatus = '官方源已接入';
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

  for (const item of health?.companies || []) {
    const record = findMatch(records, item.company);
    if (!record) continue;
    record.sourceHealthStatus = item.status || 'unknown';
    record.sourceHealthReason = item.reason || '';
    record.sourceHealthHealthy = Boolean(item.healthy);
  }

  for (const record of records) {
    if (record.sourceManaged) {
      const healthLabel = HEALTH_LABELS[record.sourceHealthStatus] || HEALTH_LABELS.unknown;
      record.intakeStatus = healthLabel;
      record.intakeProvider = (record.sourceProviders || []).join(' / ');
      if (record.sourceHealthReason) record.intakeAnalysis = record.sourceHealthReason;
      else if (!record.intakeAnalysis) record.intakeAnalysis = '官方招聘源已进入统一管理；等待或使用最近一次岗位刷新验证来源健康度。';
      continue;
    }
    const label = DISCOVERY_LABELS[record.sourceDiscoveryState] || DISCOVERY_LABELS.queued;
    if (!record.intakeStatus || !record.userRequested) record.intakeStatus = label;
    if (!record.intakeProvider && record.sourceDiscoveryProvider) record.intakeProvider = record.sourceDiscoveryProvider;
    if (!record.intakeAnalysis && record.sourceDiscoveryReason) record.intakeAnalysis = record.sourceDiscoveryReason;
    if (!record.intakeAnalysis) record.intakeAnalysis = '已进入统一来源发现队列；系统会自动寻找官方招聘入口、核验2027校招证据并在探针通过后接入抓岗。';
    if (!record.careerUrl && record.sourceDiscoveryUrl) record.careerUrl = record.sourceDiscoveryUrl;
  }

  return records;
}

export const companyRegistry = buildCompanyRegistry();
companyLibrary.splice(0, companyLibrary.length, ...companyRegistry);
