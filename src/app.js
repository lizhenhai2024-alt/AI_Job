import { demoJobs } from './data/jobs.js';
import { defaultProfile } from './data/profile.js';
import { rankJobs } from './core/matcher.js';
import { loadProfile, saveProfile, loadStatuses, saveStatuses } from './core/storage.js';

const app = document.querySelector('#app');
const PIPELINE = ['推荐', '已收藏', '已投递', '面试', 'Offer', '淘汰'];

const state = {
  tab: 'radar',
  profile: loadProfile(defaultProfile),
  statuses: loadStatuses(),
  filters: { keyword: '', city: '全部', role: '全部', minScore: '0' },
  selectedJobId: null
};

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function jobsWithState() {
  return rankJobs(
    demoJobs.map((job) => ({ ...job, status: state.statuses[job.id] || job.status || '推荐' })),
    state.profile
  );
}

function currentFilteredJobs() {
  const keyword = state.filters.keyword.trim().toLowerCase();
  return jobsWithState().filter((job) => {
    const text = [job.company, job.title, job.city, ...(job.roleFamily || []), ...(job.skills || [])].join(' ').toLowerCase();
    const hitKeyword = !keyword || text.includes(keyword);
    const hitCity = state.filters.city === '全部' || job.city === state.filters.city;
    const hitRole = state.filters.role === '全部' || (job.roleFamily || []).includes(state.filters.role);
    const hitScore = job.match.score >= Number(state.filters.minScore || 0);
    return hitKeyword && hitCity && hitRole && hitScore;
  });
}

function statData(jobs) {
  const todayCutoff = new Date('2026-09-01T00:00:00');
  return {
    total: jobs.length,
    high: jobs.filter((j) => j.match.score >= 80).length,
    must: jobs.filter((j) => j.match.score >= 85 && !j.match.risks.some((r) => r.startsWith('命中排除条件'))).length,
    closing: jobs.filter((j) => j.deadline && new Date(j.deadline) <= new Date('2026-10-01T23:59:59') && new Date(j.deadline) >= todayCutoff).length
  };
}

function shell(content) {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="logo">AI</span> AI Job <span class="badge">2027 校招</span></div>
        <nav class="nav">
          <button data-tab="radar" class="${state.tab === 'radar' ? 'active' : ''}">岗位雷达</button>
          <button data-tab="pipeline" class="${state.tab === 'pipeline' ? 'active' : ''}">投递看板</button>
          <button data-tab="profile" class="${state.tab === 'profile' ? 'active' : ''}">我的画像</button>
        </nav>
      </header>
      <main>${content}</main>
      ${renderModal()}
    </div>`;
}

function renderRadar() {
  const all = jobsWithState();
  const jobs = currentFilteredJobs();
  const stats = statData(all);
  const cities = ['全部', ...new Set(all.map((j) => j.city))];
  const roles = ['全部', ...new Set(all.flatMap((j) => j.roleFamily || []))];
  return `
    <section class="hero">
      <div><h1>今天哪些岗位值得投？</h1><p>先匹配，再投递。把时间留给真正值得争取的岗位。</p></div>
      <div class="demo-note">当前为 V1 Demo 数据，所有岗位标题均标注“示例”。下一阶段接入公司校招官网与导入数据后，继续沿用同一匹配和看板逻辑。</div>
    </section>
    <section class="stats">
      <div class="stat"><div class="value">${stats.total}</div><div class="label">候选岗位</div></div>
      <div class="stat"><div class="value">${stats.high}</div><div class="label">高匹配 ≥ 80</div></div>
      <div class="stat"><div class="value">${stats.must}</div><div class="label">建议优先投递</div></div>
      <div class="stat"><div class="value">${stats.closing}</div><div class="label">近期截止</div></div>
    </section>
    <section class="toolbar">
      <div class="field"><label>关键词</label><input id="filter-keyword" value="${esc(state.filters.keyword)}" placeholder="公司 / 岗位 / 技能" /></div>
      <div class="field"><label>城市</label><select id="filter-city">${cities.map((x) => `<option ${x === state.filters.city ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>岗位族</label><select id="filter-role">${roles.map((x) => `<option ${x === state.filters.role ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>最低匹配</label><select id="filter-score">${[0,50,65,80,85].map((x) => `<option value="${x}" ${String(x) === state.filters.minScore ? 'selected' : ''}>${x}+</option>`).join('')}</select></div>
    </section>
    <section class="jobs">
      ${jobs.length ? jobs.map(renderJobCard).join('') : '<div class="empty">没有符合当前筛选条件的岗位。</div>'}
    </section>`;
}

function renderJobCard(job) {
  const highlightHtml = job.match.highlights.slice(0,2).map((x) => `<span class="reason">✓ ${esc(x)}</span>`).join('');
  const riskHtml = job.match.risks.filter((x) => x.startsWith('命中排除条件')).slice(0,1).map((x) => `<span class="risk">△ ${esc(x)}</span>`).join('');
  return `
    <article class="job-card">
      <div>
        <div class="company">${esc(job.company)}</div>
        <h2 class="job-title">${esc(job.title)}</h2>
        <div class="meta"><span>📍 ${esc(job.city)}</span><span>🎓 ${esc(job.graduationYear)}届</span><span>🗓 截止 ${esc(job.deadline || '待核')}</span><span>${esc(job.source)}</span></div>
        <div class="tags">${(job.roleFamily || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
        <div class="reasons" style="margin-top:11px">${highlightHtml}${riskHtml}</div>
      </div>
      <div class="score-wrap">
        <div><div class="score">${job.match.score}<small>/100</small></div><span class="badge">${esc(job.match.level)}</span></div>
        <div class="actions">
          <button class="btn" data-detail="${esc(job.id)}">匹配分析</button>
          <button class="btn primary" data-status="${esc(job.id)}" data-next="${job.status === '推荐' ? '已收藏' : '已投递'}">${job.status === '推荐' ? '加入投递' : '推进状态'}</button>
        </div>
      </div>
    </article>`;
}

function renderPipeline() {
  const jobs = jobsWithState();
  return `
    <section class="hero"><div><h1>投递看板</h1><p>把“想投”变成可追踪的求职漏斗。</p></div></section>
    <section class="pipeline">
      ${PIPELINE.map((status) => {
        const items = jobs.filter((j) => j.status === status);
        return `<div class="column"><h3>${status}<span>${items.length}</span></h3>${items.map((j) => `
          <div class="pipeline-card">
            <strong>${esc(j.title)}</strong><span>${esc(j.company)} · ${j.match.score}分</span>
            <select data-pipeline-id="${esc(j.id)}">${PIPELINE.map((x) => `<option ${x === status ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </div>`).join('') || '<div class="hint">暂无岗位</div>'}</div>`;
      }).join('')}
    </section>`;
}

const arrayText = (arr) => (arr || []).join('、');
const parseArray = (value) => value.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);

function renderProfile() {
  const p = state.profile;
  return `
    <section class="hero"><div><h1>我的画像</h1><p>所有匹配结果都从这里出发；后续生成简历时也必须以这里的事实为边界。</p></div></section>
    <section class="panel">
      <form id="profile-form" class="profile-grid">
        <div class="field"><label>毕业届别</label><input name="graduationYear" value="${esc(p.graduationYear)}" /></div>
        <div class="field"><label>目标城市</label><input name="targetCities" value="${esc(arrayText(p.targetCities))}" /></div>
        <div class="field wide"><label>目标岗位族</label><input name="targetRoles" value="${esc(arrayText(p.targetRoles))}" /><div class="hint">例如：海外运营、GTM、产品营销、用户运营</div></div>
        <div class="field wide"><label>技能</label><textarea name="skills" rows="2">${esc(arrayText(p.skills))}</textarea></div>
        <div class="field"><label>语言</label><input name="languages" value="${esc(arrayText(p.languages))}" /></div>
        <div class="field"><label>经历关键词</label><input name="experienceKeywords" value="${esc(arrayText(p.experienceKeywords))}" /></div>
        <div class="field"><label>职业偏好</label><input name="workPreference" value="${esc(arrayText(p.workPreference))}" /></div>
        <div class="field"><label>硬性排除条件</label><input name="exclusions" value="${esc(arrayText(p.exclusions))}" /></div>
      </form>
      <div class="save-row"><button class="btn primary" id="save-profile">保存并重新计算</button></div>
    </section>`;
}

function renderModal() {
  if (!state.selectedJobId) return '';
  const job = jobsWithState().find((x) => x.id === state.selectedJobId);
  if (!job) return '';
  return `<div class="modal-backdrop" data-close-modal="1"><div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
    <div class="modal-head"><div><div class="company">${esc(job.company)}</div><h2>${esc(job.title)}</h2></div><button class="close" data-close-modal="1">×</button></div>
    <p>${esc(job.description)}</p>
    <h3>匹配得分：${job.match.score}/100 · ${esc(job.match.level)}</h3>
    ${job.match.dimensions.map((d) => `<div class="dimension"><strong>${esc(d.label)}</strong><div class="bar"><div style="width:${Math.round(d.ratio * 100)}%"></div></div><span>${d.score}/${d.weight}</span></div>`).join('')}
    <h3>亮点</h3><div class="tags">${job.match.highlights.map((x) => `<span class="tag">✓ ${esc(x)}</span>`).join('') || '<span class="hint">暂无明显优势</span>'}</div>
    <h3>缺口 / 风险</h3><div class="tags">${[...job.match.gaps, ...job.match.risks].map((x) => `<span class="tag">△ ${esc(x)}</span>`).join('') || '<span class="hint">暂无明显风险</span>'}</div>
  </div></div>`;
}

function render() {
  const body = state.tab === 'radar' ? renderRadar() : state.tab === 'pipeline' ? renderPipeline() : renderProfile();
  app.innerHTML = shell(body);
}

function setStatus(jobId, status) {
  state.statuses[jobId] = status;
  saveStatuses(state.statuses);
  render();
}

app.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (tab) { state.tab = tab; state.selectedJobId = null; render(); return; }

  const detail = event.target.closest('[data-detail]')?.dataset.detail;
  if (detail) { state.selectedJobId = detail; render(); return; }

  if (event.target.closest('[data-close-modal]')) { state.selectedJobId = null; render(); return; }

  const statusButton = event.target.closest('[data-status]');
  if (statusButton) { setStatus(statusButton.dataset.status, statusButton.dataset.next); return; }

  if (event.target.id === 'save-profile') {
    const form = document.querySelector('#profile-form');
    const data = new FormData(form);
    state.profile = {
      graduationYear: String(data.get('graduationYear') || '').trim(),
      targetRoles: parseArray(String(data.get('targetRoles') || '')),
      targetCities: parseArray(String(data.get('targetCities') || '')),
      skills: parseArray(String(data.get('skills') || '')),
      languages: parseArray(String(data.get('languages') || '')),
      experienceKeywords: parseArray(String(data.get('experienceKeywords') || '')),
      workPreference: parseArray(String(data.get('workPreference') || '')),
      exclusions: parseArray(String(data.get('exclusions') || ''))
    };
    saveProfile(state.profile);
    state.tab = 'radar';
    render();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'filter-keyword') {
    state.filters.keyword = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const input = document.querySelector('#filter-keyword');
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  }
});

app.addEventListener('change', (event) => {
  if (event.target.id === 'filter-city') { state.filters.city = event.target.value; render(); }
  if (event.target.id === 'filter-role') { state.filters.role = event.target.value; render(); }
  if (event.target.id === 'filter-score') { state.filters.minScore = event.target.value; render(); }
  if (event.target.matches('[data-pipeline-id]')) setStatus(event.target.dataset.pipelineId, event.target.value);
});

render();
