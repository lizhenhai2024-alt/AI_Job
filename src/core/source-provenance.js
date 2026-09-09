const CHANNELS = {
  official_ats: '公司官方校招官网 / ATS 系统',
  university: '高校就业信息网官方简章',
  platform_official: '招聘平台官方账号',
  referral: '牛客 / 脉脉官方内推帖',
  social_official: '公司官方公众号 / 微博校招公告',
  other: '其他公开来源'
};

const MINOR_LANGUAGE_RX = /日语|日文|德语|德文|法语|法文|西班牙语|西语|葡萄牙语|葡语|俄语|韩语|韩文|意大利语|意语|阿拉伯语|泰语|越南语|印尼语|印度尼西亚语|马来语|土耳其语|波兰语|荷兰语|瑞典语|挪威语|丹麦语|芬兰语|希腊语|捷克语|匈牙利语|罗马尼亚语|乌克兰语|希伯来语|第二外语|小语种/i;
const MANDATORY_RX = /必须|要求|需|须|应|具备|熟练|精通|流利|听说读写|工作语言|母语|native|business\s*level|professional\s*proficiency|\bN[1-5]\b|JLPT|TOPIK|DELF|DALF|DELE|TestDaF|Goethe|\b[BC][12]\b/i;
const COMPANY_OFFICIAL_RX = /公司官方|企业官方|官方招聘官网|官方校招官网|官方\s*ats|官方招聘接口|官方职位|官网职位|官网直投/i;

export function classifySourceChannel(job = {}) {
  if (job.sourceChannel && CHANNELS[job.sourceChannel]) return job.sourceChannel;
  const source = `${job.source || ''} ${job.verification || ''}`.toLowerCase();
  const url = String(job.sourceUrl || '').toLowerCase();

  if (/moka|beisen|feishu|飞书|北森|安克创新官方|ecoflow官方|官方招聘官网|公司官网|校招官网/.test(source)
      || (/jobs?\.|career|campus|moka|beisen|feishu|liepin\.com\/company|zhaopin\.com\/company/.test(url) && /官方/.test(source))) {
    return 'official_ats';
  }
  if (/就业信息网|就业指导中心|就业服务中心|招聘简章|宣讲会/.test(source)
      || (/career\.|job\.|jy\.|就业/.test(url) && /\.edu\.cn/.test(url))) {
    return 'university';
  }
  if (/猎聘|51job|前程无忧|智联招聘|应届生求职网/.test(source) && /官方账号|官方发布|官方/.test(source)) {
    return 'platform_official';
  }
  if (/牛客|脉脉/.test(source) || /nowcoder|maimai/.test(url)) return 'referral';
  if (/公众号|微信公众号|微博|校招公告/.test(source) || /weixin|weibo/.test(url)) return 'social_official';
  return 'other';
}

export function sourceChannelLabel(job = {}) {
  return CHANNELS[classifySourceChannel(job)] || CHANNELS.other;
}

export function sourceEvidence(job = {}) {
  const rows = [];
  const push = (kind, value) => {
    const text = String(value || '').trim();
    if (!text || rows.some((item) => item.kind === kind && item.value === text)) return;
    rows.push({ kind, value: text });
  };
  push('source', job.source);
  push('verification', job.verification);
  push('url', job.sourceUrl);
  for (const item of job.sourceEvidence || job.sources || []) {
    if (typeof item === 'string') push('evidence', item);
    else if (item && typeof item === 'object') push('evidence', item.url || item.sourceUrl || item.label || item.source);
  }
  return rows.slice(0, 12);
}

function sourceHosts(job = {}) {
  const urls = [job.sourceUrl];
  for (const item of job.sourceEvidence || []) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) urls.push(item);
    else if (item && typeof item === 'object') urls.push(item.url || item.sourceUrl || '');
  }
  for (const item of job.sources || []) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) urls.push(item);
    else if (item && typeof item === 'object') urls.push(item.url || item.sourceUrl || '');
  }
  const hosts = new Set();
  for (const value of urls.filter(Boolean)) {
    try { hosts.add(new URL(value).hostname.toLowerCase()); } catch {}
  }
  return hosts;
}

function explicitSourceCount(job = {}) {
  if (Number(job.crossSourceCount || 0) > 0) return Number(job.crossSourceCount);
  const hosts = sourceHosts(job);
  if (hosts.size > 1) return hosts.size;
  const sources = Array.isArray(job.sources) ? job.sources : [];
  const labels = new Set(sources.map((item) => {
    if (typeof item === 'string' && !/^https?:\/\//i.test(item)) return item.trim().toLowerCase();
    if (item && typeof item === 'object') return String(item.source || item.label || item.name || '').trim().toLowerCase();
    return '';
  }).filter(Boolean));
  return Math.max(hosts.size, labels.size);
}

function isCompanyOfficialSource(job = {}) {
  if (job.sourceType === 'official') return true;
  if (job.sourceType === 'secondary') return false;
  return COMPANY_OFFICIAL_RX.test(`${job.source || ''} ${job.verification || ''}`);
}

export function provenanceSummary(job = {}) {
  const evidence = sourceEvidence(job);
  const official = isCompanyOfficialSource(job);
  const crossVerified = explicitSourceCount(job) >= 2;
  return {
    channel: classifySourceChannel(job),
    channelLabel: sourceChannelLabel(job),
    official,
    crossVerified,
    evidence,
    verificationLabel: crossVerified ? '多源交叉核实' : official ? '官方源' : '待官网复核'
  };
}

export function intelligenceCompleteness(job = {}) {
  const checks = [
    ['公司', job.company],
    ['岗位名称', job.title],
    ['城市', job.city && job.city !== '待核'],
    ['2027届证据', String(job.graduationYear || '').includes('2027')],
    ['来源链接', job.sourceUrl],
    ['截止日期', job.deadline],
    ['岗位描述/要求', job.description || job._searchText]
  ];
  const filled = checks.filter(([, value]) => Boolean(value)).length;
  return { filled, total: checks.length, missing: checks.filter(([, value]) => !value).map(([label]) => label) };
}

export function languageRequirementSignal(job = {}) {
  const text = [job.title, job.description, job._searchText, ...(job.languages || []), ...(job.candidateFit?.hardRequirements || [])].filter(Boolean).join(' ');
  if (!MINOR_LANGUAGE_RX.test(text)) return { level: 'none', label: '未识别小语种硬要求线索' };
  return MANDATORY_RX.test(text)
    ? { level: 'warning', label: '识别到小语种硬要求线索，交由最终看板判定' }
    : { level: 'info', label: '识别到小语种相关描述，需核对是否为硬要求' };
}

export function compareDiscoveryIntelligence(a, b) {
  const pa = provenanceSummary(a);
  const pb = provenanceSummary(b);
  const ca = intelligenceCompleteness(a);
  const cb = intelligenceCompleteness(b);
  return Number(pb.crossVerified) - Number(pa.crossVerified)
    || Number(pb.official) - Number(pa.official)
    || cb.filled - ca.filled
    || String(b.publishedAt || b.discoveredAt || '').localeCompare(String(a.publishedAt || a.discoveredAt || ''))
    || String(a.company || '').localeCompare(String(b.company || ''), 'zh-CN');
}
