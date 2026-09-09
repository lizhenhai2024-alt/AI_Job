import { demoJobs } from './data/jobs.js';
import { liveJobs, discoveryMeta } from './data/live-jobs.js';
import { defaultProfile } from './data/profile.js';
import { companyLibrary, companyLibraryMeta } from './data/company-library.js';
import { rankJobs } from './core/matcher.js';
import { buildDailyShortlist, dailyShortlistStats } from './core/shortlist.js';
import { createCompanyIntake, buildCompanyIntakeIssueUrl } from './core/company-intake.js';
import {
  loadProfile, saveProfile, loadStatuses, saveStatuses,
  loadCompanyIntakes, upsertCompanyIntake
} from './core/storage.js';

const app = document.querySelector('#app');
const PIPELINE = ['推荐', '已收藏', '已投递', '面试', 'Offer', '淘汰'];
const baseJobs = liveJobs.length ? liveJobs : demoJobs;

const state = {
  tab: 'radar', radarMode: 'daily', profile: loadProfile(defaultProfile), statuses: loadStatuses(),
  companyIntakes: loadCompanyIntakes(), showCompanyIntake: false, intakeMessage: '',
  filters: { keyword: '', city: '全部', role: '全部', tier: '全部', minScore: '0', company: '' }, selectedJobId: null
};

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
}

function fmtDateTime(value) {
  if (!value) return '待首次自动刷新';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(d);
}

function companyKey(value = '') {
  return String(value).replace(/[（(].*?[）)]/g, '').replace(/[\s·,.，、股份有限公司集团控股]/g, '').toLowerCase();
}

function companyMatches(left, right) {
  const a = companyKey(left); const b = companyKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function jobsWithState() {
  return rankJobs(baseJobs.map((job) => ({ ...job, status: state.statuses[job.id] || job.status || '推荐' })), state.profile);
}

function currentFilteredJobs(pool = jobsWithState()) {
  const keyword = state.filters.keyword.trim().toLowerCase();
  return pool.filter((job) => {
    const text = [job.company, job.title, job.city, ...(job.roleFamily || []), ...(job.skills || [])].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword))
      && (!state.filters.company || companyMatches(job.company, state.filters.company))
      && (state.filters.city === '全部' || job.city === state.filters.city)
      && (state.filters.role === '全部' || (job.roleFamily || []).includes(state.filters.role))
      && (state.filters.tier === '全部' || job.match.tier === state.filters.tier)
      && job.match.score >= Number(state.filters.minScore || 0);
  });
}

function statData(jobs) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  return {
    s: jobs.filter((j) => j.match.tier === 'S').length,
    a: jobs.filter((j) => j.match.tier === 'A').length,
    b: jobs.filter((j) => j.match.tier === 'B').length,
    closing: jobs.filter((j) => {
      if (!j.deadline) return false;
      const d = new Date(`${j.deadline}T23:59:59`);
      return d >= now && d <= in30;
    }).length
  };
}

function companyClues() {
  const ranked = jobsWithState();
  const map = new Map();
  for (const job of ranked) {
    const item = map.get(job.company) || { company: job.company, jobs: [], cities: new Set(), roles: new Set(), bestScore: 0, bestTier: 'B', verification: job.verification || '来源待核' };
    item.jobs.push(job);
    item.cities.add(job.city);
    for (const role of job.roleFamily || []) item.roles.add(role);
    if (job.match.score > item.bestScore) { item.bestScore = job.match.score; item.bestTier = job.match.tier; }
    map.set(job.company, item);
  }
  const discovered = [...map.values()].map((item) => ({ ...item, cities: [...item.cities], roles: [...item.roles] }));
  const libraryCards = companyLibrary.map((company) => {
    const linked = discovered.filter((item) => companyMatches(item.company, company.name) || (company.aliases || []).some((alias) => companyMatches(item.company, alias)));
    const jobs = linked.flatMap((item) => item.jobs);
    const cities = [...new Set([...(company.cities || []), ...linked.flatMap((item) => item.cities)])].filter(Boolean);
    const roles = [...new Set([...(company.targetTracks || []), ...linked.flatMap((item) => item.roles)])].filter(Boolean);
    const best = [...jobs].sort((a, b) => b.match.score - a.match.score)[0];
    const localIntake = state.companyIntakes.find((item) => companyMatches(item.name, company.name));
    const intakeStatus = company.intakeStatus || localIntake?.status || '';
    const intakeAnalysis = company.intakeAnalysis || '';
    return {
      ...company, jobs, cities, roles, localIntake,
      discoveredCount: jobs.length,
      bestScore: best?.match.score ?? null,
      bestTier: best?.match.tier ?? null,
      intakeStatus,
      verification: jobs.length ? (best?.verification || '自动岗位池来源待核') : '尚无自动岗位池关联',
      analysis: intakeAnalysis || (company.status === '主投'
        ? '已进入主投池；公司状态不代替岗位核验，优先查看已关联的真实岗位。'
        : company.status === '风险'
          ? '风险观察：投递前需单独核验招聘稳定性与岗位真实性。'
          : '纳入候选监测；发现真实岗位后再按个人画像参与排序。')
    };
  });
  const unmatched = discovered.filter((item) => !libraryCards.some((company) => companyMatches(item.company, company.name) || (company.aliases || []).some((alias) => companyMatches(item.company, alias))))
    .map((item) => ({ ...item, status: '待归档', evidence: { count: 0, roles: [], cities: [], statuses: [], nextSteps: [] }, targetTracks: [], industries: [], analysis: '自动发现的新公司，尚未进入人工公司库。' }));
  const localOnly = state.companyIntakes
    .filter((request) => !libraryCards.some((company) => companyMatches(company.name, request.name)) && !unmatched.some((company) => companyMatches(company.company, request.name)))
    .map((request) => ({
      name: request.name, status: '观察', industries: [], cities: [], roles: request.focus || [], targetTracks: request.focus || [], jobs: [],
      discoveredCount: 0, bestScore: null, bestTier: null, evidence: { count: 0 }, userRequested: true,
      intakeStatus: request.status || '待提交分析', careerUrl: request.careerUrl || '', localIntake: request,
      analysis: request.careerUrl
        ? '已加入本机分析队列；在 GitHub 确认提交后，系统将识别招聘系统、核验 2027 届并尝试抓取岗位。'
        : '已加入本机分析队列；尚未提供官方招聘链接，提交后先进入“待发现官方招聘入口”。'
    }));
  const rank = { '主投': 4, '观察': 3, '风险': 2, '移出': 1, '待归档': 0 };
  return [...libraryCards, ...localOnly, ...unmatched].sort((a, b) => (rank[b.status] - rank[a.status]) || (b.bestScore || 0) - (a.bestScore || 0) || b.discoveredCount - a.discoveredCount);
}

function shell(content) {
  return `<div class="shell">
    <header class="topbar">
      <div class="brand"><span class="logo">AI</span> AI Job <span class="badge">2027 校招</span></div>
      <nav class="nav">
        <button data-tab="radar" class="${state.tab === 'radar' ? 'active' : ''}">岗位雷达</button>
        <button data-tab="companies" class="${state.tab === 'companies' ? 'active' : ''}">公司雷达</button>
        <button data-tab="pipeline" class="${state.tab === 'pipeline' ? 'active' : ''}">投递看板</button>
        <button data-tab="profile" class="${state.tab === 'profile' ? 'active' : ''}">我的画像</button>
      </nav>
    </header>
    <main>${content}</main>${renderModal()}
  </div>`;
}

function renderRadar() {
  const all = jobsWithState();
  const daily = buildDailyShortlist(all);
  const pool = state.radarMode === 'daily' ? daily : all;
  const jobs = currentFilteredJobs(pool);
  const stats = statData(pool);
  const dailyStats = dailyShortlistStats(all);
  const cities = ['全部', ...new Set(all.map((j) => j.city).filter(Boolean))];
  const roles = ['全部', ...new Set(all.flatMap((j) => j.roleFamily || []))];
  const live = liveJobs.length > 0;
  const modeLabel = state.radarMode === 'daily' ? `今日精选 ${daily.length}` : `全部岗位 ${all.length}`;
  return `<section class="hero">
      <div><h1>今天哪些岗位值得投？</h1><p>默认只看最值得推进的 10–20 个；S/A 优先，不足 10 个时才用高质量 B 档补足。</p>
        <div class="actions" style="margin-top:12px">
          <button class="btn ${state.radarMode === 'daily' ? 'primary' : ''}" data-radar-mode="daily">今日精选 ${daily.length}</button>
          <button class="btn ${state.radarMode === 'all' ? 'primary' : ''}" data-radar-mode="all">全部岗位 ${all.length}</button>
        </div>
      </div>
      <div class="demo-note ${live ? 'live-note' : ''}">
        <strong>${live ? `● ${esc(modeLabel)}` : 'Demo 回退模式'}</strong><br>
        ${live ? `${companyClues().length} 家公司 · 更新 ${esc(fmtDateTime(discoveryMeta.updatedAt))}` : '当前没有自动岗位数据，正在展示示例数据。'}
        ${live && state.radarMode === 'daily' ? `<br>官方 ${dailyStats.official} · 待官网复核 ${dailyStats.needsVerification}` : live ? '<br>官方来源优先；二手来源投递前需回官网核验。' : ''}
      </div>
    </section>
    <section class="stats">
      <div class="stat"><div class="value">${stats.s}</div><div class="label">S档 · 优先投递</div></div>
      <div class="stat"><div class="value">${stats.a}</div><div class="label">A档 · 可以投</div></div>
      <div class="stat"><div class="value">${stats.b}</div><div class="label">B档 · 机会型</div></div>
      <div class="stat"><div class="value">${stats.closing}</div><div class="label">30天内截止</div></div>
    </section>
    <section class="toolbar">
      <div class="field"><label>关键词</label><input id="filter-keyword" value="${esc(state.filters.keyword)}" placeholder="公司 / 岗位 / 技能" /></div>
      <div class="field"><label>城市</label><select id="filter-city">${cities.map((x) => `<option ${x === state.filters.city ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>岗位族</label><select id="filter-role">${roles.map((x) => `<option ${x === state.filters.role ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>优先级</label><select id="filter-tier">${['全部','S','A','B'].map((x) => `<option ${x === state.filters.tier ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>最低匹配</label><select id="filter-score">${[0,55,68,70,80,85].map((x) => `<option value="${x}" ${String(x) === state.filters.minScore ? 'selected' : ''}>${x}+</option>`).join('')}</select></div>
    </section>
    <section class="jobs">${jobs.length ? jobs.map(renderJobCard).join('') : '<div class="empty">没有符合当前筛选条件的岗位。</div>'}</section>`;
}

function renderJobCard(job) {
  const highlights = job.match.highlights.slice(0,2).map((x) => `<span class="reason">✓ ${esc(x)}</span>`).join('');
  const risks = job.match.risks.slice(0,1).map((x) => `<span class="risk">△ ${esc(x)}</span>`).join('');
  const verify = job.verification ? `<span class="source-flag">${esc(job.verification)}</span>` : '';
  return `<article class="job-card">
    <div>
      <div class="company">${esc(job.company)}</div><h2 class="job-title">${esc(job.title)}</h2>
      <div class="meta"><span>📍 ${esc(job.city)}</span><span>🎓 ${esc(job.graduationYear)}届</span><span>🗓 截止 ${esc(job.deadline || '待核')}</span><span>${esc(job.source || '来源待核')}</span>${verify}</div>
      <div class="tags"><span class="tag"><strong>${esc(job.match.tier)}档 · ${esc(job.match.priority || '')}</strong></span>${(job.roleFamily || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      <div class="reasons" style="margin-top:11px">${highlights}${risks}</div>
    </div>
    <div class="score-wrap">
      <div><div class="score">${job.match.score}<small>/100</small></div><span class="badge">${esc(job.match.tierLabel)}</span></div>
      <div class="actions">
        ${job.sourceUrl ? `<a class="btn" href="${esc(job.sourceUrl)}" target="_blank" rel="noopener">查看来源</a>` : ''}
        <button class="btn" data-detail="${esc(job.id)}">匹配分析</button>
        <button class="btn primary" data-status="${esc(job.id)}" data-next="${job.status === '推荐' ? '已收藏' : '已投递'}">${job.status === '推荐' ? '加入投递' : '推进状态'}</button>
      </div>
    </div>
  </article>`;
}

function renderCompanyIntakeForm() {
  if (!state.showCompanyIntake) return '';
  return `<section class="panel" style="margin-bottom:18px">
    <form id="company-intake-form" class="profile-grid">
      <div class="field"><label>公司名称 *</label><input name="name" required placeholder="例如：追觅科技" /></div>
      <div class="field"><label>官方招聘 / 校招链接</label><input name="careerUrl" type="url" placeholder="https://...（可选，但建议填写）" /></div>
      <div class="field wide"><label>重点关注方向</label><input name="focus" placeholder="海外运营、GTM、品牌、国际业务、HR..." /></div>
      <div class="field wide"><label>备注</label><textarea name="note" rows="2" placeholder="为什么关注这家公司，或希望优先找哪类岗位"></textarea></div>
    </form>
    <div class="hint">提交后会先进入本机公司库，并打开 GitHub 的标准分析请求。确认提交后，Actions 才能安全写入共享公司库并自动识别招聘源；浏览器不会保存或暴露 GitHub Token。</div>
    <div class="save-row"><button class="btn primary" id="submit-company-intake">加入公司库并提交分析</button></div>
  </section>`;
}

function renderCompanies() {
  const companies = companyClues();
  const counts = ['主投','观察','风险','移出'].map((status) => `${status} ${companies.filter((item) => item.status === status).length}`).join(' · ');
  const requested = companies.filter((item) => item.userRequested || item.localIntake).length;
  return `<section class="hero"><div><h1>公司雷达</h1><p>除了系统已维护的公司，也可以把新公司直接加入分析队列，让系统继续找官方 2027 校招和匹配岗位。</p>
      <div class="actions" style="margin-top:12px"><button class="btn primary" data-toggle-company-intake="1">${state.showCompanyIntake ? '收起添加公司' : '+ 添加公司'}</button></div>
    </div>
    <div class="demo-note live-note"><strong>${companies.length} 家候选公司</strong><br>${esc(counts)} · 用户新增 ${requested}<br>公司库更新：${esc(companyLibraryMeta.generatedAt)} · 岗位池更新：${esc(fmtDateTime(discoveryMeta.updatedAt))}</div></section>
    ${state.intakeMessage ? `<div class="source-box" style="margin-bottom:18px"><strong>${esc(state.intakeMessage)}</strong></div>` : ''}
    ${renderCompanyIntakeForm()}
    <section class="company-grid">${companies.map((c) => `<article class="company-card">
      <div class="company-card-head"><div><div class="company">${esc(c.status || '待归档')} · ${c.userRequested || c.localIntake ? '用户添加' : c.restoredCandidate ? '已恢复候选' : '公司库'}</div><h2>${esc(c.name || c.company)}</h2></div><div class="company-score">${c.bestScore ?? '—'}<small>${c.bestTier ? `${esc(c.bestTier)}档最高匹配` : '暂无实时评分'}</small></div></div>
      <div class="meta"><span>真实岗位 ${c.discoveredCount ?? c.jobs.length}</span><span>已启动证据 ${c.evidence?.count || 0} 条</span><span>📍 ${esc(c.cities.slice(0,3).join('、') || '待核')}</span></div>
      <div class="tags"><span class="tag">${esc(c.industries?.[0] || '待分类')}</span>${c.roles.slice(0,5).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      ${c.intakeStatus ? `<div class="source-box"><strong>分析状态：${esc(c.intakeStatus)}</strong>${c.intakeProvider ? ` · ${esc(c.intakeProvider)}` : ''}</div>` : ''}
      <p class="company-analysis">${esc(c.analysis || '')}</p>
      <div class="company-actions">
        ${c.discoveredCount ? `<button class="btn primary" data-company="${esc(c.name || c.company)}">查看 ${c.discoveredCount} 个真实岗位</button>` : '<span class="hint">暂未关联实时岗位，持续分析中</span>'}
        ${c.careerUrl ? `<a class="btn" href="${esc(c.careerUrl)}" target="_blank" rel="noopener">官方招聘</a>` : ''}
        ${c.intakeIssueUrl ? `<a class="btn" href="${esc(c.intakeIssueUrl)}" target="_blank" rel="noopener">分析请求</a>` : ''}
      </div>
    </article>`).join('') || '<div class="empty">尚未发现公司。</div>'}</section>`;
}

function renderPipeline() {
  const jobs = jobsWithState();
  return `<section class="hero"><div><h1>投递看板</h1><p>把“想投”变成可追踪的求职漏斗。</p></div></section>
    <section class="pipeline">${PIPELINE.map((status) => {
      const items = jobs.filter((j) => j.status === status);
      return `<div class="column"><h3>${status}<span>${items.length}</span></h3>${items.map((j) => `<div class="pipeline-card"><strong>${esc(j.title)}</strong><span>${esc(j.company)} · ${j.match.tier}档 · ${j.match.score}分</span><select data-pipeline-id="${esc(j.id)}">${PIPELINE.map((x) => `<option ${x === status ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`).join('') || '<div class="hint">暂无岗位</div>'}</div>`;
    }).join('')}</section>`;
}

const arrayText = (arr) => (arr || []).join('、');
const parseArray = (value) => value.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);

function renderProfile() {
  const p = state.profile;
  const evidence = p.experienceEvidence || [];
  return `<section class="hero"><div><h1>我的画像</h1><p>自动发现负责“尽量不漏”，这里负责“哪些最值得你投”。</p></div></section>
    <section class="panel"><form id="profile-form" class="profile-grid">
      <div class="field"><label>毕业届别</label><input name="graduationYear" value="${esc(p.graduationYear)}" /></div>
      <div class="field"><label>目标城市</label><input name="targetCities" value="${esc(arrayText(p.targetCities))}" /></div>
      <div class="field wide"><label>目标岗位族</label><input name="targetRoles" value="${esc(arrayText(p.targetRoles))}" /><div class="hint">例如：海外运营、GTM、产品营销、贸易运营</div></div>
      <div class="field wide"><label>技能</label><textarea name="skills" rows="2">${esc(arrayText(p.skills))}</textarea></div>
      <div class="field"><label>语言</label><input name="languages" value="${esc(arrayText(p.languages))}" /></div>
      <div class="field"><label>经历关键词</label><input name="experienceKeywords" value="${esc(arrayText(p.experienceKeywords))}" /></div>
      <div class="field"><label>职业偏好</label><input name="workPreference" value="${esc(arrayText(p.workPreference))}" /></div>
      <div class="field"><label>硬性排除条件</label><input name="exclusions" value="${esc(arrayText(p.exclusions))}" /></div>
    </form><div class="save-row"><button class="btn primary" id="save-profile">保存并重新计算</button></div></section>
    <section class="hero" style="margin-top:18px"><div><h2>简历证据基线</h2><p>这些经历用于判断“真正做过什么”，不会因改写岗位关键词而凭空生成经验。</p></div></section>
    <section class="company-grid">${evidence.map((item) => `<article class="company-card">
      <div class="company">真实经历</div><h3>${esc(item.name)}</h3>
      <p>${esc(item.evidence)}</p>
      <div class="tags">${(item.keywords || []).slice(0,8).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    </article>`).join('') || '<div class="empty">尚未配置可追溯的简历经历证据。</div>'}</section>`;
}

function renderModal() {
  if (!state.selectedJobId) return '';
  const job = jobsWithState().find((x) => x.id === state.selectedJobId);
  if (!job) return '';
  const eligibility = job.match.eligibility || { verdict: '届别待核', evidence: [] };
  const steps = job.match.fourStepAnalysis || [];
  const evidenceMatches = job.match.experienceEvidence?.directMatches || [];
  return `<div class="modal-backdrop" data-close-modal="1"><div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
    <div class="modal-head"><div><div class="company">${esc(job.company)}</div><h2>${esc(job.title)}</h2></div><button class="close" data-close-modal="1">×</button></div>
    <p>${esc(job.description)}</p><div class="source-box"><strong>数据来源：</strong>${esc(job.source || '待核')} · ${esc(job.verification || '待核')}${job.sourceUrl ? ` · <a href="${esc(job.sourceUrl)}" target="_blank" rel="noopener">打开来源</a>` : ''}</div>
    <h3>${esc(job.match.tierLabel)} · ${job.match.score}/100</h3><p>${esc(job.match.tierReason)}</p>
    <h3>投递资格</h3>
    <div class="source-box"><strong>${esc(eligibility.verdict)}</strong>${(eligibility.evidence || []).length ? ` · ${esc(eligibility.evidence.join('；'))}` : ' · 招聘对象/毕业时间请投递前再次核对官网'}</div>
    <h3>五步 JD + 投递判断</h3>
    ${steps.map((step) => `<div class="source-box"><strong>${step.step ? `${step.step}. ` : ''}${esc(step.label)}：${esc(step.verdict)}</strong><br>${esc(step.detail || '无补充证据')}</div>`).join('') || '<div class="hint">当前岗位暂缺结构化判断，建议打开来源核对完整 JD。</div>'}
    <h3>真实经历证据</h3>
    ${evidenceMatches.length ? evidenceMatches.map((item) => `<div class="source-box"><strong>${esc(item.name)}</strong><br>${esc(item.evidence || '')}<br><span class="hint">命中：${esc((item.matchedKeywords || []).join('、'))}</span></div>`).join('') : `<div class="source-box"><strong>${esc(job.match.experienceEvidence?.verdict || '没有直接经历证据')}</strong><br>${esc(job.match.experienceEvidence?.detail || '没有找到能直接对应岗位职责的已记录经历。')}</div>`}
    <h3>V3 评分维度</h3>
    ${job.match.dimensions.map((d) => `<div class="dimension"><strong>${esc(d.label)}</strong><div class="bar"><div style="width:${Math.round(d.ratio * 100)}%"></div></div><span>${d.score}/${d.weight}</span></div>`).join('')}
    <h3>亮点</h3><div class="tags">${job.match.highlights.map((x) => `<span class="tag">✓ ${esc(x)}</span>`).join('') || '<span class="hint">暂无明显优势</span>'}</div>
    <h3>缺口 / 风险</h3><div class="tags">${[...job.match.gaps, ...job.match.risks].map((x) => `<span class="tag">△ ${esc(x)}</span>`).join('') || '<span class="hint">暂无明显风险</span>'}</div>
  </div></div>`;
}

function render() {
  const body = state.tab === 'radar' ? renderRadar() : state.tab === 'companies' ? renderCompanies() : state.tab === 'pipeline' ? renderPipeline() : renderProfile();
  app.innerHTML = shell(body);
}

function setStatus(jobId, status) { state.statuses[jobId] = status; saveStatuses(state.statuses); render(); }

app.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (tab) { state.tab = tab; state.selectedJobId = null; render(); return; }
  const radarMode = event.target.closest('[data-radar-mode]')?.dataset.radarMode;
  if (radarMode) { state.radarMode = radarMode; render(); return; }
  if (event.target.closest('[data-toggle-company-intake]')) {
    state.showCompanyIntake = !state.showCompanyIntake; state.intakeMessage = ''; render(); return;
  }
  if (event.target.id === 'submit-company-intake') {
    const form = document.querySelector('#company-intake-form');
    if (!form?.reportValidity()) return;
    const data = new FormData(form);
    try {
      const request = createCompanyIntake({
        name: data.get('name'), careerUrl: data.get('careerUrl'), focus: data.get('focus'), note: data.get('note')
      });
      const issueUrl = buildCompanyIntakeIssueUrl(request);
      request.issueUrl = issueUrl;
      request.status = '已加入本机队列，待 GitHub 确认';
      state.companyIntakes = upsertCompanyIntake(request);
      state.intakeMessage = `${request.name} 已加入本机公司库。请在刚打开的 GitHub 页面点击 Submit new issue，后台才会正式开始分析和抓岗。`;
      state.showCompanyIntake = false;
      window.open(issueUrl, '_blank', 'noopener');
      render();
    } catch (error) {
      state.intakeMessage = String(error?.message || error); render();
    }
    return;
  }
  const company = event.target.closest('[data-company]')?.dataset.company;
  if (company) {
    state.filters.company = company; state.filters.keyword = ''; state.filters.city = '全部'; state.filters.role = '全部'; state.filters.tier = '全部'; state.filters.minScore = '0';
    state.radarMode = 'all'; state.tab = 'radar'; render(); return;
  }
  const detail = event.target.closest('[data-detail]')?.dataset.detail;
  if (detail) { state.selectedJobId = detail; render(); return; }
  if (event.target.closest('[data-close-modal]')) { state.selectedJobId = null; render(); return; }
  const statusButton = event.target.closest('[data-status]');
  if (statusButton) { setStatus(statusButton.dataset.status, statusButton.dataset.next); return; }
  if (event.target.id === 'save-profile') {
    const data = new FormData(document.querySelector('#profile-form'));
    state.profile = {
      graduationYear: String(data.get('graduationYear') || '').trim(), targetRoles: parseArray(String(data.get('targetRoles') || '')),
      targetCities: parseArray(String(data.get('targetCities') || '')), skills: parseArray(String(data.get('skills') || '')),
      languages: parseArray(String(data.get('languages') || '')), experienceKeywords: parseArray(String(data.get('experienceKeywords') || '')),
      workPreference: parseArray(String(data.get('workPreference') || '')), exclusions: parseArray(String(data.get('exclusions') || '')),
      experienceEvidence: structuredClone(state.profile.experienceEvidence || defaultProfile.experienceEvidence || [])
    };
    saveProfile(state.profile); state.radarMode = 'daily'; state.tab = 'radar'; render();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'filter-keyword') {
    state.filters.keyword = event.target.value; const cursor = event.target.selectionStart; render();
    const input = document.querySelector('#filter-keyword'); input?.focus(); input?.setSelectionRange(cursor, cursor);
  }
});

app.addEventListener('change', (event) => {
  if (event.target.id === 'filter-city') { state.filters.city = event.target.value; render(); }
  if (event.target.id === 'filter-role') { state.filters.role = event.target.value; render(); }
  if (event.target.id === 'filter-tier') { state.filters.tier = event.target.value; render(); }
  if (event.target.id === 'filter-score') { state.filters.minScore = event.target.value; render(); }
  if (event.target.matches('[data-pipeline-id]')) setStatus(event.target.dataset.pipelineId, event.target.value);
});

render();