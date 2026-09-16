import crypto from 'node:crypto';
import { decodeHtml, htmlToText, classifyRole, detectSkills, detectRisks, extractSalary } from './core.mjs';

const DEFAULT_UA = 'AI-Job/0.2 (+https://github.com/lizhenhai2024-alt/AI_Job; public-campus-job-indexer)';

export async function fetchText(url, { timeoutMs = 15000, userAgent = DEFAULT_UA, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const PROJECT_RX = /href="(https:\/\/www\.liepin\.com\/campus\/project-detail\/(\d+)\/)"[\s\S]*?<(?:div|h3) class="(?:company-title|job-title) ellipsis-1">([^<]+)<\/(?:div|h3)>/gi;

function projectsFromHtml(html) {
  const seen = new Set();
  const projects = [];
  for (const m of html.matchAll(PROJECT_RX)) {
    const url = m[1];
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const name = decodeHtml(m[3]).trim() || '';
    projects.push({ id, url, name });
  }
  return projects;
}

// 从项目名（形如"富冶集团2027届校园招聘"）提取公司名：取"2027届|2026届|校园招聘|校招|秋招|春招|招聘"之前的主体
export function companyFromProjectName(name = '') {
  const clean = decodeHtml(name).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.+?)(?:\d{4}届|校园招聘|校招|秋招|春招|招聘|管培生计划|全球校园招聘)/);
  if (!m) return clean || '待核公司';
  let company = m[1].replace(/[（(【\[].*?[)）\]】]?$/, '').trim();
  // 公司名后残留年份（如"中国太平保险集团2027秋季"）时截掉
  company = company.replace(/(20\d{2})(届|年)?(秋|春|夏|冬)?(季)?$/, '').trim();
  // 去掉结尾无意义词（如"|""-"等）
  company = company.replace(/[|｜\-—\s]+$/, '').trim();
  return company || clean || '待核公司';
}

// 发现猎聘校招项目：comp-list 全量列表 + campus.liepin.com 首页热门
export async function discoverProjects({ fetcher = fetchText, maxProjects = 300 } = {}) {
  const out = [];
  const seen = new Set();
  for (const source of ['https://www.liepin.com/campus/comp-list/', 'https://campus.liepin.com/']) {
    if (out.length >= maxProjects) break;
    try {
      const html = await fetcher(source);
      for (const p of projectsFromHtml(html)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= maxProjects) break;
      }
    } catch (error) {
      console.warn(`[liepin:discoverProjects] ${source} failed: ${error.message}`);
    }
  }
  return out;
}

// 解析项目详情页：公司名（meta description 的项目名）+ 校招岗位列表（lptjob 链接）
export function parseProjectPage(html = '', projectUrl = '') {
  const metaDesc = ((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [,''])[1] || '')
    || ((html.match(/<meta[^>]+content=["']([^"']*校招[^"']*校招岗位[^"']*)/i) || [,''])[1] || '');
  const text = htmlToText(html);
  const nameCandidate = decodeHtml(metaDesc).match(/提供([^，。]{2,40}?校招(?:的详细信息|相关信息))/) || null;
  const projectName = (nameCandidate?.[1] || metaDesc.split('的详细信息')[0] || '').replace(/猎聘校园为广大在校生提供/, '').trim();
  const company = companyFromProjectName(projectName) || companyFromProjectName(text.split('\n').find((l) => /校招/.test(l)) || '');

  const jobs = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="(https:\/\/www\.liepin\.com\/lptjob\/(\d+)\/)"[^>]*title="([^"]*)"/g)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    jobs.push({ id: m[2], url: m[1], title: decodeHtml(m[3]).replace(/招聘$/, '').trim() });
  }
  return { company: company || '待核公司', projectName, jobs };
}

function matchField(text, pattern) {
  const m = String(text).match(pattern);
  return m ? m[1].trim() : '';
}

function normalizeDateCN(value = '') {
  if (!value) return '';
  const m = String(value).match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// 猎聘岗位详情页解析（SSR，字段完整：岗位名/薪资/城市/学历/招人/发布/截止/职责/要求/公司）
export function parseLiepinJobPage({ html, url, projectCompany = '', now = new Date() }) {
  const pageText = htmlToText(html);
  const titleTag = decodeHtml((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1]).replace(/\s+/g, ' ').trim();

  // title 页：「【惠州 计划工程师招聘】-深圳信立泰药业股份有限公司惠州招聘信息-猎聘」
  const titleM = titleTag.match(/【([^】]*?)[ ]?([^】]+)】-([^-]+?)(?:招聘信息-猎聘|$)/) || titleTag.match(/【([^】]*)】-([^-]+?)(?:招聘信息-猎聘|$)/);
  let city = '';
  let title = '';
  let company = '';
  if (titleM) {
    if (titleM[2] && /招聘|工程师|专员|经理|管培|实习生|运营|顾问|助理|研究员|设计师|销售/.test(titleM[2])) {
      city = titleM[1] || '';
      title = titleM[2].replace(/招聘$/, '').trim();
      company = titleM[3]?.replace(/(惠州|上海|北京|深圳|广州|杭州|苏州|武汉|长沙|成都|南京|天津|重庆|厦门|珠海|西安|大连|青岛|宁波|东莞|佛山|合肥|济南|福州|昆明|南宁|无锡|常州|徐州|嘉兴|绍兴|温州|台州|金华|湖州|南通|扬州|泰州|盐城|淮安|连云港|宿迁|镇江)$/, '')?.trim() || '';
    } else {
      title = titleM[1].replace(/招聘$/, '').trim();
      city = '';
      company = titleM[2]?.split(' ')[0]?.trim() || '';
    }
  }

  // 正文结构（可观测顺序）：岗位名\n薪资\n城市-区域\n应届 学历\n招N人\nM月D日更新
  const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l && !/^--+>?$/.test(l));
  // 岗位名优先从面包屑（common-current-position 内最后一个 job 链接）提取，避免 <title> 标签污染
  const crumbM = String(html).match(/common-current-position[\s\S]*?\/job\/\d+\.shtml">([^<]+)<\/a>/);
  const crumbTitle = crumbM ? decodeHtml(crumbM[1]).replace(/招聘$/, '').trim() : '';
  const titleFromText = crumbTitle || (title && !title.includes(' ') ? title : '待核岗位');
  const salaryFromText = lines.find((l) => /^[\d.]+[kK万]?\s*[-—~～至到]\s*[\d.]+[kK万](?:元\/[天日])?|\d{2,3}元\/[天日]$/.test(l)) || extractSalary(pageText);
  const cityFromText = (lines.find((l) => /^[^-—]*[-—][^-—]*(区|市)$/.test(l)) || '').split(/[-—]/)[0].trim() || city;
  const headCountText = matchField(pageText, /招(\d+)人|招聘人数[：:]\s*(\d+)人/);
  const headCount = headCountText ? Number(headCountText) : '';
  const updatedM = pageText.match(/(\d{1,2})月(\d{1,2})日更新/);
  const publishedAt = updatedM ? `${now.getFullYear()}-${updatedM[1].padStart(2, '0')}-${updatedM[2].padStart(2, '0')}` : '';
  const deadline = normalizeDateCN(matchField(pageText, /截止日期[：:]\s*(20\d{2}年\d{1,2}月\d{1,2}日)/));

  const descStart = pageText.indexOf('职位介绍');
  const descPart = descStart >= 0 ? pageText.slice(descStart) : pageText;
  const reqM = descPart.match(/任职资格[：:]([\s\S]*?)(?:截止日期|招聘人数|公司简介|查看全部|猎聘温馨提示)/);
  const reqM2 = descPart.match(/职责描述[：:]([\s\S]*?)(?:任职资格|截止日期|招聘人数|公司简介|查看全部)/);
  const jobRequirements = reqM ? reqM[1].trim() : '';
  const jobDescription = (reqM2 ? reqM2[1].trim() : '') || (descStart >= 0 ? pageText.slice(descStart, descStart + 1800) : '');

  const jobText = `${title}\n${company}\n${jobDescription}\n${jobRequirements}`;
  const roleFamily = classifyRole(titleFromText);
  const skills = detectSkills(jobText);
  const riskTags = detectRisks(jobText);
  const experienceKeywords = ['海外', '运营', '内容', '项目', '市场', '电商', '用户', '数据', '跨文化', '营销', '品牌', '供应链', '客户'].filter((w) => jobText.includes(w)).slice(0, 8);
  const preferenceTags = [/海外|国际|全球/.test(jobText) ? '国际业务' : '', /跨文化|本地化|海外用户|海外市场/.test(jobText) ? '跨文化' : '', /出海|海外市场|跨境/.test(jobText) ? '出海' : ''].filter(Boolean);
  const is2027 = /2027届|2027\s*届|2026年\s*9月[^。\n]{0,40}2027年\s*8月/.test(`${pageText} ${title}`);
  const isIntern = /实习|Intern(?:ship)?\b/i.test(`${title} ${jobDescription} ${jobRequirements}`) || /元\/[天日]/.test(`${pageText} ${salaryFromText}`);

  const id = `liepin-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
  return {
    id,
    company: company || projectCompany || '待核公司',
    title: titleFromText,
    roleFamily,
    city: cityFromText || '待核',
    graduationYear: is2027 ? '2027' : '',
    skills,
    languages: /英语|英文|CET|雅思|托福|English/i.test(jobText) ? ['英语'] : [],
    experienceKeywords,
    preferenceTags,
    riskTags,
    source: '猎聘校园',
    sourceType: 'secondary',
    sourceUrl: url,
    verification: '二手来源，待官网核验',
    publishedAt,
    deadline,
    description: `自动发现的 ${roleFamily.join(' / ')} 类岗位${skills.length ? `；识别关键词：${skills.slice(0, 5).join('、')}` : ''}。完整职责与要求请打开来源页面，并在投递前回公司校招官网核验。`,
    salary: salaryFromText || '',
    headCount,
    status: '推荐',
    discoveredAt: now.toISOString(),
    closed: /收藏\s*已结束|已结束|停止招聘|职位已关闭/.test(pageText) || (deadline && new Date(`${deadline}T23:59:59+08:00`) < now),
    jobDescription,
    jobRequirements,
    _searchText: jobText,
    _recruitType: isIntern ? '实习' : '校招'
  };
}

export async function fetchProjectJobs(project, { fetcher = fetchText } = {}) {
  const html = await fetcher(project.url);
  const { company, jobs } = parseProjectPage(html, project.url);
  return { company, jobs, project };
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      try { out[current] = await mapper(items[current], current); }
      catch (error) { out[current] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return out;
}

export async function searchLiepinCampus(profile, {
  fetcher = fetchText,
  maxProjects = profile.maxProjects || 120,
  maxJobDetails = profile.maxJobDetails || 300,
  concurrency = profile.concurrency || 5,
  now = new Date()
} = {}) {
  const projects = await discoverProjects({ fetcher, maxProjects });
  const projectJobs = await mapLimit(projects, concurrency, async (project) => {
    try { return await fetchProjectJobs(project, { fetcher }); }
    catch (error) { return { error, project }; }
  });
  const okProjects = projectJobs.filter((x) => x && !x.error && x.jobs?.length);

  // 先按项目内岗位标题粗筛（2027/非实习），再抓详情，控制详情请求量
  const candidates = [];
  for (const p of okProjects) {
    for (const job of p.jobs) {
      const evidence = `${job.title} ${p.project.name || ''} ${p.company || ''}`;
      if (/实习|Intern(?:ship)?\b/i.test(evidence)) continue;
      if (/2027届|2027\s*届/.test(evidence) || !/\d{4}届/.test(evidence)) {
        candidates.push({ ...job, company: p.company, projectName: p.project.name });
      }
    }
    if (candidates.length >= maxJobDetails) break;
  }

  const results = await mapLimit(candidates.slice(0, maxJobDetails), concurrency, async (cand) => {
    try {
      const html = await fetcher(cand.url);
      const job = parseLiepinJobPage({ html, url: cand.url, projectCompany: cand.company, now });
      return shouldKeepLiepin(job, profile, now) ? job : null;
    } catch (error) {
      return { error };
    }
  });

  const jobs = dedupeLiepinJobs(results.filter((x) => x && !x.error));
  return {
    jobs,
    stats: {
      discoveredProjects: projects.length,
      projectsWithJobs: okProjects.length,
      candidates,
      detailScanned: results.length,
      detailErrors: results.filter((x) => x?.error).length,
      keptJobs: jobs.length
    }
  };
}

// 猎聘岗位保留规则：2027 届优先；无届次标注的校招岗（应届可投）也保留；实习一律排除
export function shouldKeepLiepin(job, profile, now = new Date()) {
  if (!job) return false;
  if (job.closed) return false;
  if (/实习|兼职|part[- ]?time|\bIntern(?:ship)?\b/i.test(`${job.title} ${job._recruitType || ''}`)) return false;
  if (job.graduationYear === '2027') return true;
  // 无明确届次的"应届/本科/学生可投"校招岗，且标题非纯实习 → 保留（聚合站信息不全，宁宽勿漏）
  if (/\d{4}届/.test(`${job.title} ${job.description}`)) return false;
  return true;
}

export function dedupeLiepinJobs(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    if (!job?.id) continue;
    const key = `${String(job.company).trim().toLowerCase()}|${String(job.title).trim().toLowerCase()}|${String(job.city).trim().toLowerCase()}`;
    const prev = map.get(key);
    if (!prev || String(job.publishedAt || '') > String(prev.publishedAt || '')) map.set(key, job);
  }
  return [...map.values()];
}
