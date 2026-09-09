import { liveJobs } from './data/live-jobs.js';
import { companyRiskSummary, evidenceLevelLabel, riskTypeLabel } from './core/company-risk.js';

const jobs = Array.isArray(liveJobs) ? liveJobs : [];
const jobById = new Map(jobs.map((job) => [String(job.id), job]));

const RISK_SOURCE_GUIDE = [
  {
    level: 'A',
    name: '一手材料',
    sources: '公司公告/官网、交易所/监管、法院/裁判文书、公司官方公众号/微博',
    usage: '可直接确认事件主体、时间与事实边界。'
  },
  {
    level: 'B',
    name: '高可信媒体 / 公司回应',
    sources: 'Reuters、第一财经、界面、澎湃等，或媒体明确引用公司回应',
    usage: '用于确认公开事件；不把报道范围扩大到未提及的团队、地区或年份。'
  },
  {
    level: 'C',
    name: '社区经验线索',
    sources: 'CampusShame、牛客、脉脉、知乎、V2EX 等',
    usage: '用于发现校招毁约、实习留用、工作强度等线索；保留原帖/快照，不能由单帖外推成全公司事实。'
  },
  {
    level: 'D',
    name: '未经核实传闻',
    sources: '无法追溯原帖、仅截图转述或单一匿名爆料',
    usage: '默认隐藏，不作为事实、黑名单或投递结论。'
  }
];

function companyKey(value = '') {
  return String(value)
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限公司|集团|控股|中国/gi, '')
    .replace(/[\s·,.，、_-]/g, '')
    .toLowerCase();
}

function sameCompany(a, b) {
  const left = companyKey(a);
  const right = companyKey(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function create(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function safeLink(url, label = '查看证据') {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const link = create('a', 'intel-evidence-link', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function riskSourceGuideNode() {
  const details = create('details', 'risk-source-guide');
  details.append(create('summary', 'risk-source-guide-summary', '来源说明：A/B 高可信 · CampusShame / 牛客 / 脉脉等为社区线索'));
  const body = create('div', 'risk-source-guide-body');
  for (const item of RISK_SOURCE_GUIDE) {
    const row = create('div', 'risk-source-row');
    row.append(
      create('strong', '', `${item.level}级 · ${item.name}`),
      create('p', '', `典型来源：${item.sources}`),
      create('p', '', `使用原则：${item.usage}`)
    );
    body.append(row);
  }
  body.append(create(
    'p',
    'risk-source-foot',
    'CampusShame 是校招案例汇总/证据索引，主要引用牛客、脉脉、知乎等公开论坛，因此默认按 C 级二手社区线索处理；若条目可回溯到 A/B 级原始证据，则以原始证据等级为准。'
  ));
  details.append(body);
  return details;
}

function compensationStrip(job) {
  const comp = job?.compensation || {};
  const strip = create('div', 'compensation-strip');
  const month = create('span', comp.disclosed ? 'comp-pill has-data' : 'comp-pill', `月薪：${job.monthlySalary || comp.monthlyDisplay || '未披露'}`);
  const year = create('span', comp.disclosed ? 'comp-pill has-data' : 'comp-pill', `年薪：${job.annualSalary || comp.annualDisplay || '未披露'}`);
  strip.append(month, year);
  if (comp.disclosed) {
    const source = create('span', 'comp-source', `${comp.sourceLabel || '岗位来源'} · ${comp.confidence === 'high' ? '高可信' : '待官网复核'}`);
    strip.append(source);
  }
  return strip;
}

function riskEventNode(event) {
  const row = create('div', `risk-event ${event.sentiment === 'positive' ? 'positive' : event.sentiment === 'negative' ? 'negative' : 'mixed'}`);
  const head = create('div', 'risk-event-head');
  head.append(
    create('strong', '', `${event.date || '日期待核'} · ${riskTypeLabel(event.type)}`),
    create('span', 'evidence-level', `${event.evidenceLevel}级 · ${evidenceLevelLabel(event.evidenceLevel)}`)
  );
  row.append(head, create('div', 'risk-event-title', event.title || '历史事件'));
  if (event.summary) row.append(create('p', '', event.summary));
  const foot = create('div', 'risk-event-foot', `范围：${event.scope || '待核'} · 来源：${event.source || '待核'}`);
  const link = safeLink(event.sourceUrl);
  if (link) foot.append(document.createTextNode(' · '), link);
  row.append(foot);
  return row;
}

function companyRiskPanel(company, { compact = false } = {}) {
  const risk = companyRiskSummary(company);
  const panel = create('div', compact ? 'company-risk-panel compact' : 'company-risk-panel');
  const title = create('div', 'company-risk-title', '历史风险 / 实习留用线索');
  panel.append(title, riskSourceGuideNode());

  if (!risk.hasData) {
    panel.append(create('p', 'risk-empty', '暂无已录入的高可信公开风险事件；这不等于公司“无风险”，建议继续核验团队和年份。'));
    return panel;
  }

  const summary = create('div', 'risk-summary-line');
  summary.append(
    create('span', 'risk-chip', `高可信事件 ${risk.highConfidence.length}`),
    create('span', 'risk-chip', `社区线索 ${risk.community.length}`),
    create('span', 'risk-chip', `实习留用线索 ${risk.internConversion.length}`)
  );
  panel.append(summary);
  for (const event of risk.events.slice(0, compact ? 2 : 4)) panel.append(riskEventNode(event));
  panel.append(create('p', 'risk-method-note', '仅作历史情报与面试反问线索，不自动生成公司黑名单分数；历史事件不等于当前状态。'));
  return panel;
}

function decorateJobCards() {
  for (const card of document.querySelectorAll('.job-card')) {
    if (card.dataset.compensationEnhanced === '1') continue;
    const id = card.querySelector('[data-detail]')?.dataset.detail;
    const job = jobById.get(String(id || ''));
    if (!job) continue;
    const target = card.querySelector('.reasons') || card.querySelector('.meta');
    if (target) target.insertAdjacentElement('afterend', compensationStrip(job));
    card.dataset.compensationEnhanced = '1';
  }
}

function decorateCompanyCards() {
  for (const card of document.querySelectorAll('.company-card')) {
    if (card.dataset.riskEnhanced === '1') continue;
    const company = card.querySelector('[data-company]')?.dataset.company;
    if (!company) continue;
    const companyJobs = jobs.filter((job) => sameCompany(job.company, company));
    const salaryKnown = companyJobs.filter((job) => job.compensation?.disclosed).length;
    const tags = card.querySelector('.tags');
    if (tags) tags.append(create('span', 'tag', `薪资已披露 ${salaryKnown}/${companyJobs.length || 0}`));
    const actions = card.querySelector('.company-actions');
    const panel = companyRiskPanel(company, { compact: true });
    if (actions) actions.insertAdjacentElement('beforebegin', panel);
    else card.append(panel);
    card.dataset.riskEnhanced = '1';
  }
}

function modalJob() {
  const modal = document.querySelector('.modal');
  if (!modal) return null;
  const company = modal.querySelector('.modal-head .company')?.textContent?.trim() || '';
  const title = modal.querySelector('.modal-head h2')?.textContent?.trim() || '';
  return jobs.find((job) => sameCompany(job.company, company) && String(job.title || '').trim() === title) || null;
}

function decorateModal() {
  const modal = document.querySelector('.modal');
  if (!modal || modal.dataset.intelEnhanced === '1') return;
  const job = modalJob();
  if (!job) return;

  const comp = job.compensation || {};
  const section = create('div', 'detail-section compensation-detail');
  section.append(create('h3', '', '薪资情报'));
  const grid = create('div', 'detail-grid');
  const box = (label, value) => {
    const node = create('div', 'detailbox');
    node.append(create('b', '', label), create('span', '', value));
    return node;
  };
  grid.append(
    box('月薪', job.monthlySalary || comp.monthlyDisplay || '未披露'),
    box('年薪', job.annualSalary || comp.annualDisplay || '未披露'),
    box('原始薪资', comp.raw || job.salary || '未披露'),
    box('薪资证据', comp.evidence || '来源未披露数字薪资')
  );
  section.append(grid, create('p', 'risk-method-note', '年薪若由月薪推算，会明确标注薪数；未写薪数时仅按12薪估算，不包含未披露奖金、股票或补贴。'));

  const riskSection = create('div', 'detail-section');
  riskSection.append(companyRiskPanel(job.company));
  const actions = modal.querySelector('.modal-actions');
  if (actions) {
    actions.insertAdjacentElement('beforebegin', riskSection);
    riskSection.insertAdjacentElement('beforebegin', section);
  } else {
    modal.append(section, riskSection);
  }
  modal.dataset.intelEnhanced = '1';
}

function installStyles() {
  if (document.querySelector('#intelligence-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'intelligence-enhancement-styles';
  style.textContent = `
    .compensation-strip{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
    .comp-pill{font-size:13px;padding:5px 9px;border-radius:999px;border:1px solid var(--line,#d8dee8);background:var(--panel,#fff)}
    .comp-pill.has-data{font-weight:650}.comp-source{font-size:12px;opacity:.7}
    .company-risk-panel{margin-top:14px;padding-top:12px;border-top:1px solid var(--line,#e5e7eb)}
    .company-risk-panel.compact .risk-event:nth-of-type(n+4){display:none}
    .company-risk-title{font-weight:750;margin-bottom:8px}.risk-summary-line{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .risk-source-guide{margin:0 0 9px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:rgba(248,250,252,.72)}
    .risk-source-guide summary{cursor:pointer;list-style:none;padding:7px 9px;font-size:12px;font-weight:650;line-height:1.45;opacity:.86}
    .risk-source-guide summary::-webkit-details-marker{display:none}.risk-source-guide summary:before{content:'＋';display:inline-block;width:18px;opacity:.7}.risk-source-guide[open] summary:before{content:'－'}
    .risk-source-guide-body{padding:0 9px 9px;display:grid;gap:7px}.risk-source-row{padding:7px 8px;border-radius:8px;background:var(--panel,#fff);border:1px solid var(--line,#e5e7eb)}
    .risk-source-row strong{display:block;font-size:12px;margin-bottom:2px}.risk-source-row p{margin:2px 0;font-size:12px;line-height:1.5;opacity:.78}.risk-source-foot{margin:2px 1px 0;font-size:12px;line-height:1.55;opacity:.8}
    .risk-chip,.evidence-level{font-size:12px;padding:3px 7px;border-radius:999px;border:1px solid var(--line,#d8dee8)}
    .risk-event{padding:9px 10px;margin:7px 0;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:var(--panel,#fff)}
    .risk-event.negative{border-left-width:3px}.risk-event.positive{border-left-width:3px}.risk-event-head{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}
    .risk-event-title{font-weight:650;margin-top:5px}.risk-event p{margin:5px 0;font-size:13px;line-height:1.55}.risk-event-foot,.risk-method-note,.risk-empty{font-size:12px;line-height:1.55;opacity:.76}
    .intel-evidence-link{text-decoration:underline}.compensation-detail .detail-grid{margin-bottom:8px}
  `;
  document.head.append(style);
}

function decorate() {
  installStyles();
  decorateJobCards();
  decorateCompanyCards();
  decorateModal();
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    decorate();
  });
});

const root = document.querySelector('#app');
if (root) observer.observe(root, { childList: true, subtree: true });
decorate();
