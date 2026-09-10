import { demoJobs } from './data/jobs.js';
import { liveJobs, discoveryMeta } from './data/live-jobs.js';
import { sourceChannels } from './data/source-channels.js';
import { companyMeta } from './data/company-meta.js';
import {
  compareDiscoveryIntelligence,
  intelligenceCompleteness,
  languageRequirementSignal,
  provenanceSummary
} from './core/source-provenance.js';
import { createCompanyIntake, buildCompanyIntakeIssueUrl } from './core/company-intake.js';
import { loadCompanyIntakes, upsertCompanyIntake } from './core/storage.js';

const FINAL_BOARD_URL = 'https://campus-job-board-mu.vercel.app/';
const app = document.querySelector('#app');
const baseJobs = liveJobs.length ? liveJobs : demoJobs;

const state = {
  tab: 'jobs',
  filters: { keyword: '', city: '全部', channel: '全部', verification: '全部', company: '' },
  selectedJobId: null,
  companyIntakes: loadCompanyIntakes(),
  intakeMessage: ''
};

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
}

function fmtDateTime(value) {
  if (!value) return '待首次自动刷新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(date);
}

function fmtDate(value) {
  if (!value) return '待核';
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}

function companyKey(value = '') {
  return String(value).replace(/[（(].*?[）)]/g, '').replace(/股份有限公司|集团有限公司|有限公司|集团|控股|中国/gi, '').replace(/[\s·,.，、]/g, '').toLowerCase();
}

function companyMatches(left, right) {
  const a = companyKey(left);
  const b = companyKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function active(job) {
  if (job.closed) return false;
  if (!job.deadline) return true;
  const d = new Date(`${job.deadline}T23:59:59+08:00`);
  return Number.isNaN(d.getTime()) || d >= new Date();
}

function jobsWithIntel() {
  return baseJobs
    .map((job) => ({
      ...job,
      _provenance: provenanceSummary(job),
      _completeness: intelligenceCompleteness(job),
      _languageSignal: languageRequirementSignal(job)
    }))
    .sort(compareDiscoveryIntelligence);
}

function filteredJobs() {
  const f = state.filters;
  const keyword = f.keyword.trim().toLowerCase();
  return jobsWithIntel().filter((job) => {
    const text = [job.company, job.title, job.city, job.source, job.verification, ...(job.roleFamily || []), ...(job.skills || [])].filter(Boolean).join(' ').toLowerCase();
    const verification = job._provenance.crossVerified ? '多源交叉核实' : job._provenance.official ? '官方源' : '待官网复核';
    return (!keyword || text.includes(keyword))
      && (!f.company || companyMatches(job.company, f.company))
      && (f.city === '全部' || job.city === f.city)
      && (f.channel === '全部' || job._provenance.channel === f.channel)
      && (f.verification === '全部' || verification === f.verification);
  });
}

function nav() {
  const items = [
    ['jobs', '岗位情报'],
    ['companies', '公司情报'],
    ['sources', '五大渠道'],
    ['intake', '添加公司']
  ];
  return `<header class="topbar">
    <div class="brand"><span class="logo">AI</span> AI Job <span class="badge">岗位发现 / 情报库</span></div>
    <nav class="nav">${items.map(([key, label]) => `<button data-tab="${key}" class="${state.tab === key ? 'active' : ''}">${label}</button>`).join('')}</nav>
  </header>`;
}

function shell(content) {
  return `<div class="shell">${nav()}<main>${content}</main>${renderModal()}</div>`;
}

function boundaryNotice() {
  return `<div class="boundary-note">
    <strong>职责边界：</strong>AI_Job 只负责岗位发现、来源核验、交叉取证、去重与情报完整度；
    <strong>S/A/B、匹配度、岗位方向、公司匹配度、是否值得投</strong>全部由最终看板统一判断。
    <a href="${FINAL_BOARD_URL}" target="_blank" rel="noopener">打开「2027届校招机会看板 · 英语专业」</a>
  </div>`;
}

function renderJobs() {
  const all = jobsWithIntel();
  const jobs = filteredJobs();
  const official = all.filter((job) => job._provenance.official).length;
  const cross = all.filter((job) => job._provenance.crossVerified).length;
  const activeCount = all.filter(active).length;
  const cities = ['全部', ...new Set(all.map((job) => job.city).filter(Boolean))];
  const channels = ['全部', ...sourceChannels.map((item) => item.id)];
  const channelName = (id) => sourceChannels.find((item) => item.id === id)?.name || id;

  return `${boundaryNotice()}
    <section class="hero">
      <div>
        <h1>2027届校招岗位情报库</h1>
        <p>先把岗位找全、找真、找新；不在这里做最终求职评级。</p>
      </div>
      <div class="demo-note ${liveJobs.length ? 'live-note' : ''}">
        <strong>${liveJobs.length ? '● 实时岗位池' : 'Demo 回退模式'}</strong><br>
        ${liveJobs.length ? `${all.length} 条岗位 · 更新 ${esc(fmtDateTime(discoveryMeta.updatedAt))}` : '当前未读取到自动岗位池。'}
      </div>
    </section>
    <section class="stats">
      <div class="stat"><div class="value">${all.length}</div><div class="label">发现岗位</div></div>
      <div class="stat"><div class="value">${official}</div><div class="label">官方源岗位</div></div>
      <div class="stat"><div class="value">${cross}</div><div class="label">已保留多源交叉证据</div></div>
      <div class="stat"><div class="value">${activeCount}</div><div class="label">当前未识别关闭/过期</div></div>
    </section>
    <section class="toolbar intel-toolbar">
      <div class="field"><label>关键词</label><input id="filter-keyword" value="${esc(state.filters.keyword)}" placeholder="公司 / 岗位 / 来源 / 抓取标签" /></div>
      <div class="field"><label>城市</label><select id="filter-city">${cities.map((x) => `<option value="${esc(x)}" ${x === state.filters.city ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>获取渠道</label><select id="filter-channel">${channels.map((x) => `<option value="${esc(x)}" ${x === state.filters.channel ? 'selected' : ''}>${esc(x === '全部' ? x : channelName(x))}</option>`).join('')}</select></div>
      <div class="field"><label>来源状态</label><select id="filter-verification">${['全部','多源交叉核实','官方源','待官网复核'].map((x) => `<option ${x === state.filters.verification ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </section>
    <div class="summary-row"><span>当前显示 <strong>${jobs.length}</strong> / ${all.length}</span><span>排序：交叉证据 → 官方源 → 情报完整度 → 发布时间</span></div>
    <section class="jobs">${jobs.length ? jobs.map(renderJobCard).join('') : '<div class="empty">没有符合当前筛选条件的岗位。</div>'}</section>`;
}

function renderJobCard(job) {
  const p = job._provenance;
  const c = job._completeness;
  const sourceClass = p.crossVerified ? 'ok' : p.official ? 'ok' : 'warn';
  const lang = job._languageSignal.level === 'warning' ? `<span class="risk">△ ${esc(job._languageSignal.label)}</span>` : '';
  return `<article class="job-card intel-card">
    <div>
      <div class="company">${esc(job.company || '待核公司')}</div>
      <h2 class="job-title">${esc(job.title || '待核岗位')}</h2>
      <div class="meta">
        <span>📍 ${esc(job.city || '待核')}</span>
        <span>🎓 ${esc(job.graduationYear ? `${job.graduationYear}届` : '届别待核')}</span>
        <span>🗓 截止 ${esc(fmtDate(job.deadline))}</span>
        <span>${active(job) ? '● 未识别关闭' : '○ 已过期/关闭'}</span>
      </div>
      <div class="tags">
        <span class="tag ${sourceClass}">${esc(p.verificationLabel)}</span>
        <span class="tag">${esc(p.channelLabel)}</span>
        ${(job.roleFamily || []).slice(0, 4).map((x) => `<span class="tag">抓取标签：${esc(x)}</span>`).join('')}
      </div>
      <div class="reasons" style="margin-top:11px">
        <span class="reason">✓ 情报字段 ${c.filled}/${c.total}</span>
        ${c.missing.length ? `<span class="risk">△ 待补：${esc(c.missing.slice(0, 3).join('、'))}</span>` : '<span class="reason">✓ 核心字段齐全</span>'}
        ${lang}
      </div>
    </div>
    <div class="intel-side">
      <div class="intel-source"><strong>${esc(p.verificationLabel)}</strong><small>${esc(job.source || '来源待核')}</small></div>
      <div class="actions">
        ${job.sourceUrl ? `<a class="btn" href="${esc(job.sourceUrl)}" target="_blank" rel="noopener">打开来源</a>` : ''}
        <button class="btn" data-detail="${esc(job.id)}">查看情报</button>
      </div>
    </div>
  </article>`;
}

function companySummaries() {
  const map = new Map();
  for (const job of jobsWithIntel()) {
    const item = map.get(job.company) || { company: job.company, jobs: [], official: 0, cross: 0, channels: new Set(), latest: '' };
    item.jobs.push(job);
    item.official += Number(job._provenance.official);
    item.cross += Number(job._provenance.crossVerified);
    item.channels.add(job._provenance.channelLabel);
    const date = job.publishedAt || job.discoveredAt || '';
    if (date > item.latest) item.latest = date;
    map.set(job.company, item);
  }
  return [...map.values()].sort((a, b) => b.jobs.length - a.jobs.length || b.official - a.official || String(b.latest).localeCompare(String(a.latest)));
}

function renderCompanies() {
  const companies = companySummaries();
  return `${boundaryNotice()}
    <section class="hero"><div><h1>公司招聘情报</h1><p>这里只统计“发现了什么、来自哪里、证据是否充分”，不做公司匹配度评级。</p></div></section>
    <section class="company-grid">${companies.map((item) => `<article class="company-card">
      <div class="company-card-head"><div><div class="company">公司</div><h2><a href="#" class="company-link" data-company="${esc(item.company)}">${esc((companyMeta[item.company] || {}).fullName || item.company || '待核公司')}</a></h2><div class="company-meta-tags">${[((companyMeta[item.company] || {}).nature) ? `<span class="tag tag-nature">${esc((companyMeta[item.company] || {}).nature)}</span>` : '', ((companyMeta[item.company] || {}).scale) ? `<span class="tag tag-scale">${esc((companyMeta[item.company] || {}).scale)}</span>` : '', ...(((companyMeta[item.company] || {}).tags) || []).slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`)].filter(Boolean).join('')}</div></div><div class="company-score">${item.jobs.length}<small>发现岗位</small></div></div>
      <div class="tags"><span class="tag">官方源 ${item.official}</span><span class="tag">多源证据 ${item.cross}</span><span class="tag">渠道 ${item.channels.size}</span></div>
      <p class="company-analysis">${esc([...item.channels].join(' · ') || '来源渠道待核')}</p>
      <div class="company-actions"><button class="btn" data-company="${esc(item.company)}">查看该公司岗位</button></div>
    </article>`).join('')}</section>`;
}

function renderSources() {
  const all = jobsWithIntel();
  const counts = Object.fromEntries(sourceChannels.map((channel) => [channel.id, all.filter((job) => job._provenance.channel === channel.id).length]));
  const totalClassified = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return `${boundaryNotice()}
    <section class="hero"><div><h1>五大岗位获取渠道</h1><p>经多轮交叉核实与去重后，保留来源证据；二手信息默认要求回公司官网复核。</p></div></section>
    <section class="stats">
      <div class="stat"><div class="value">5</div><div class="label">标准获取渠道</div></div>
      <div class="stat"><div class="value">${totalClassified}</div><div class="label">已归类岗位记录</div></div>
      <div class="stat"><div class="value">${all.filter((j) => j._provenance.official).length}</div><div class="label">官方源记录</div></div>
      <div class="stat"><div class="value">${all.filter((j) => !j._provenance.official).length}</div><div class="label">需官网复核记录</div></div>
    </section>
    <section class="source-channel-grid">${sourceChannels.map((channel, index) => `<article class="panel source-channel-card">
      <div class="source-index">${index + 1}</div>
      <div><h2>${esc(channel.name)}</h2><p>${esc(channel.policy)}</p>
      <div class="tags">${channel.examples.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>
      <div class="source-count"><strong>${counts[channel.id] || 0}</strong><span>当前归类</span></div>
    </article>`).join('')}</section>`;
}

function renderIntake() {
  const recent = state.companyIntakes.slice(0, 12);
  return `${boundaryNotice()}
    <section class="hero"><div><h1>添加公司到发现队列</h1><p>提供公司名或官方招聘入口后，AI_Job 负责继续做来源发现和岗位抓取。</p></div></section>
    <section class="panel intake-panel">
      <form id="company-intake-form" class="profile-grid">
        <div class="field"><label>公司名称 *</label><input name="name" required placeholder="例如：韶音科技" /></div>
        <div class="field"><label>官方招聘 / 校招链接</label><input name="careerUrl" placeholder="https://..." /></div>
        <div class="field wide"><label>希望重点发现的岗位关键词</label><input name="focus" placeholder="海外运营、GTM、项目管理、HR..." /></div>
        <div class="field wide"><label>备注</label><textarea name="note" rows="3" placeholder="例如：优先检查 2027 届正式校招，不要实习岗位"></textarea></div>
        <div class="save-row wide"><button class="btn primary" type="submit">加入公司库并提交分析</button></div>
      </form>
      ${state.intakeMessage ? `<div class="source-box" style="margin-top:14px">${esc(state.intakeMessage)}</div>` : ''}
    </section>
    <section class="panel" style="margin-top:16px"><h2>最近加入的公司</h2>${recent.length ? recent.map((item) => `<div class="intake-row"><strong>${esc(item.name)}</strong><span>分析状态：${esc(item.status || '待提交分析')}</span><span>${esc((item.focus || []).join('、') || '未限定关键词')}</span></div>`).join('') : '<div class="empty">还没有本机添加记录。</div>'}</section>`;
}

function renderModal() {
  if (!state.selectedJobId) return '';
  const job = jobsWithIntel().find((item) => item.id === state.selectedJobId);
  if (!job) return '';
  const p = job._provenance;
  const c = job._completeness;
  const lang = job._languageSignal;
  return `<div class="modal-backdrop" data-close="1"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-head"><div><div class="company">${esc(job.company)}</div><h2>${esc(job.title)}</h2></div><button class="close" data-close="1">×</button></div>
    <div class="detail-section"><h3>来源与核验</h3><div class="detail-grid">
      <div class="detailbox"><b>获取渠道</b><span>${esc(p.channelLabel)}</span></div>
      <div class="detailbox"><b>来源状态</b><span>${esc(p.verificationLabel)}</span></div>
      <div class="detailbox"><b>岗位来源</b><span>${esc(job.source || '待核')}</span></div>
      <div class="detailbox"><b>情报完整度</b><span>${c.filled}/${c.total}${c.missing.length ? ` · 待补 ${esc(c.missing.join('、'))}` : ''}</span></div>
    </div></div>
    <div class="detail-section"><h3>资格与风险线索（非最终判断）</h3><div class="tags">
      <span class="tag ${String(job.graduationYear || '').includes('2027') ? 'ok' : 'warn'}">${String(job.graduationYear || '').includes('2027') ? '已识别 2027 届证据' : '届别证据待核'}</span>
      <span class="tag ${active(job) ? 'ok' : 'bad'}">${active(job) ? '未识别关闭/过期' : '已识别关闭/过期'}</span>
      <span class="tag ${lang.level === 'warning' ? 'warn' : ''}">${esc(lang.label)}</span>
    </div></div>
    <div class="detail-section"><h3>来源证据</h3>${p.evidence.length ? p.evidence.map((item) => `<div class="source-box"><strong>${esc(item.kind)}</strong> · ${esc(item.value)}</div>`).join('') : '<div class="source-box">暂无额外来源证据。</div>'}</div>
    <div class="detail-section"><h3>抓取字段</h3><div class="detail-grid">
      <div class="detailbox"><b>城市</b><span>${esc(job.city || '待核')}</span></div>
      <div class="detailbox"><b>截止日期</b><span>${esc(fmtDate(job.deadline))}</span></div>
      <div class="detailbox"><b>发布时间</b><span>${esc(job.publishedAt || '待核')}</span></div>
      <div class="detailbox"><b>抓取标签</b><span>${esc((job.roleFamily || []).join('、') || '待分类')}</span></div>
    </div></div>
    <div class="actions modal-actions">
      ${job.sourceUrl ? `<a class="btn" href="${esc(job.sourceUrl)}" target="_blank" rel="noopener">打开原始来源</a>` : ''}
      <a class="btn primary" href="${FINAL_BOARD_URL}" target="_blank" rel="noopener">到最终看板判断</a>
    </div>
  </div></div>`;
}

function render() {
  const content = state.tab === 'jobs' ? renderJobs()
    : state.tab === 'companies' ? renderCompanies()
      : state.tab === 'sources' ? renderSources()
        : renderIntake();
  app.innerHTML = shell(content);
}

app.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (tab) { state.tab = tab; state.selectedJobId = null; render(); return; }
  const detail = event.target.closest('[data-detail]')?.dataset.detail;
  if (detail) { state.selectedJobId = detail; render(); return; }
  if (event.target.closest('[data-close]')) { state.selectedJobId = null; render(); return; }
  const company = event.target.closest('[data-company]')?.dataset.company;
  if (company) {
    state.filters.company = company;
    state.tab = 'jobs';
    render();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id !== 'filter-keyword' || event.isComposing) return;
  state.filters.keyword = event.target.value;
  const pos = event.target.selectionStart;
  render();
  const input = document.querySelector('#filter-keyword');
  input?.focus();
  input?.setSelectionRange(pos, pos);
});

app.addEventListener('change', (event) => {
  const map = {
    'filter-city': 'city',
    'filter-channel': 'channel',
    'filter-verification': 'verification'
  };
  const key = map[event.target.id];
  if (!key) return;
  state.filters[key] = event.target.value;
  render();
});

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'company-intake-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const request = createCompanyIntake(data);
    state.companyIntakes = upsertCompanyIntake(request);
    const issueUrl = buildCompanyIntakeIssueUrl(request);
    state.intakeMessage = `${request.name} 已加入本机发现队列；已打开 GitHub 提交页，提交后 Actions 可继续处理。`;
    window.open(issueUrl, '_blank', 'noopener');
    event.target.reset();
  } catch (error) {
    state.intakeMessage = error?.message || '添加失败，请检查输入。';
  }
  render();
});

render();
