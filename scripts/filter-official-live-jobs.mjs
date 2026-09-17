#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePath = path.join(root, 'src/data/live-jobs.js');

export function isCategoryHeadingCompany(value = '') {
  const text = String(value || '').normalize('NFKC').replace(/\s+/g, '').trim();
  return /^\d+[.、．-]?(?:研发|制造|营销|职能|事业|服务|金融|技术|生产|销售|管理|水平事业)(?:类)?单位$/u.test(text);
}

export function isTrustedUniversityOfficialBacked(job = {}) {
  return job?.sourceType === 'secondary'
    && job?.sourceChannel === 'university'
    && String(job?.graduationYear || '') === '2027'
    && /^https?:\/\//i.test(String(job?.officialCareerUrl || ''))
    && Boolean(job?.universitySource?.school);
}

const PROFESSIONAL_TITLE_RX = /(?:造型设计|交通工具设计|工业设计|软件|算法|前端|后端|客户端|服务端|全栈|嵌入式|固件|芯片|集成电路|IC|硬件|电子|电气|机械|结构|工艺|材料|仿真|CAE|控制|自动化|机器人|测试开发|测试工程师|研发工程师|开发工程师|技术工程师|数据工程师|产品工程师|质量工程师|制造工程师|工业工程师|设备工程师|NPI工程师|IE工程师|供应商质量工程师|解决方案工程师|售前技术|技术支持工程师|运维工程师|网络工程师|安全工程师|数据库工程师|数据科学家|机器学习|深度学习|计算机视觉|NLP|自然语言|土木|建筑设计|化学研发|生物研发|医学|临床|药学|财务|会计|审计|税务|出纳|司库|资金管理|成本会计|成本管理|财务BP|投融资|投资分析|证券|基金|量化|精算|法务|律师|法律顾问|合规专员|知识产权)(?:工程师|专员|顾问|分析师|经理|管培生|岗|方向)?|(?:software|algorithm|firmware|embedded|hardware|electrical|mechanical|structural|process|materials?|simulation|developer|engineer|machine learning|data scientist|accounting|accountant|audit|auditor|tax|treasury|investment analyst|actuarial|legal counsel|lawyer)\b/i;

// 复合专业条件必须按原子条件绑定语义：
// 1) “理工科背景，化学/材料/汽车/机械等相关专业优先” => 理工科背景是硬门槛；
// 2) “交通工具设计/工业设计/产品设计相关专业优先；专业对口” => “专业对口”把前述专业范围提升为硬门槛。
const HARD_UMBRELLA_MAJOR_RX = /(?:理工科|理工类|工科|工科类|理科|理科类|STEM|工程类|设计类|艺术类|管理类|商科|经济类|财经类)(?:相关)?(?:专业|专业背景|背景|学科|方向)?/i;
const SPECIFIC_PROFESSIONAL_MAJOR_RX = /(?:计算机|软件工程|人工智能|电子信息|电子科学|电子|通信|机械|车辆工程|汽车|自动化|电气|微电子|集成电路|材料|能源|动力|化工|化学|物理|数学|统计|数据科学|土木|建筑|交通工具设计|工业设计|产品设计|汽车设计|造型设计|设计学|视觉传达|环境设计|服装设计|生物|医学|药学|临床|会计|财务管理|审计|税务|金融学|精算|法学|法律|知识产权|工商管理|市场营销|国际商务|国际贸易|人力资源|管理科学).{0,14}(?:专业|专业背景|学科|方向|背景)/i;
const MAJOR_UNLIMITED_RX = /专业不限|不限专业|无专业限制|不限制专业|不限学科|专业不作限制/i;
const SOFT_MAJOR_RX = /优先|加分|更佳|者佳|优先考虑|preferred|prefer/i;
const ENGLISH_COMPATIBLE_MAJOR_RX = /(?:英语专业|英语语言文学|外国语言文学|外语类|语言类|翻译(?:专业|方向)?|文学类|文科类|人文社科(?:类)?)/i;
const HARD_ALIGNMENT_RX = /(?:专业(?:必须|须|需)?(?:对口|匹配|相符)|专业背景(?:必须|须|需)?(?:与|和)?(?:岗位|职位)?(?:匹配|对口|相符)|所学专业.{0,12}(?:岗位|职位).{0,8}(?:相关|匹配|对口|相符)|所学专业.{0,12}(?:符合|满足).{0,8}(?:岗位|职位)?要求|专业背景.{0,12}(?:符合|满足).{0,8}(?:岗位|职位)?要求)/i;

function majorScopeText(job = {}) {
  const evidence = Array.isArray(job?.jdEvidence?.majorClauses)
    ? job.jdEvidence.majorClauses.filter(Boolean).join('\n')
    : '';
  const primary = [
    evidence,
    job?.major,
    job?.majorRequirement,
    job?.jobRequirements,
    job?.requirements
  ].filter(Boolean);
  if (primary.length) return primary.join('\n');
  // 某些来源没有独立 requirements 字段，只能从完整 JD 兜底。
  return [job?.jobDescription, job?.description, job?._searchText].filter(Boolean).join('\n');
}

function hasProfessionalMajorSignal(clause = '') {
  return HARD_UMBRELLA_MAJOR_RX.test(clause) || SPECIFIC_PROFESSIONAL_MAJOR_RX.test(clause);
}

function atomicMajorClauses(job = {}) {
  const text = majorScopeText(job);
  if (!text) return [];
  // 逗号通常分隔独立招聘条件；不切顿号“、”，避免拆散专业并列列表。
  return text.split(/[\n\r。；;！!？?，,]+/).map((x) => x.trim()).filter(Boolean);
}

export function hardOutOfScopeMajorClauses(job = {}) {
  const clauses = atomicMajorClauses(job);
  if (!clauses.length) return [];

  const directHard = clauses.filter((clause) => {
    if (MAJOR_UNLIMITED_RX.test(clause)) return false;
    if (!hasProfessionalMajorSignal(clause)) return false;
    // “理工科优先”“工业设计专业优先”是软偏好，只软化当前原子条件。
    if (SOFT_MAJOR_RX.test(clause)) return false;
    // 只有明确包含英语/外语/语言等可接受专业时，英语专业候选人才通过该硬专业条件。
    if (ENGLISH_COMPATIBLE_MAJOR_RX.test(clause)) return false;
    return true;
  });

  // “专业对口/专业匹配”本身没有列专业名，需要回看同一 JD 的专业范围。
  // 若前文只写“设计类相关专业优先”，后文再写“专业对口”，则前述范围成为基础候选池，
  // 不能因为“优先”二字把整个专业要求当成开放专业。
  const hardAlignment = clauses.find((clause) =>
    HARD_ALIGNMENT_RX.test(clause)
    && !SOFT_MAJOR_RX.test(clause)
    && !MAJOR_UNLIMITED_RX.test(clause)
  );
  if (hardAlignment) {
    const scopedProfessional = clauses.find((clause) =>
      hasProfessionalMajorSignal(clause)
      && !MAJOR_UNLIMITED_RX.test(clause)
      && !ENGLISH_COMPATIBLE_MAJOR_RX.test(clause)
    );
    if (scopedProfessional) {
      directHard.push(`${hardAlignment}（限定专业范围：${scopedProfessional}）`);
    }
  }

  return [...new Set(directHard)];
}

export function hasHardOutOfScopeProfessionalMajor(job = {}) {
  return hardOutOfScopeMajorClauses(job).length > 0;
}

export function isOutOfScopeProfessionalRole(job = {}) {
  const title = String(job?.title || '').trim();
  if (PROFESSIONAL_TITLE_RX.test(title)) return true;
  return hasHardOutOfScopeProfessionalMajor(job);
}

function hasTrustedProductionSource(job = {}) {
  return job?.sourceType === 'official' || isTrustedUniversityOfficialBacked(job);
}

export function keepProductionJobs(jobs = []) {
  return (jobs || []).filter((job) => {
    if (isCategoryHeadingCompany(job?.company)) return false;
    if (isOutOfScopeProfessionalRole(job)) return false;
    return hasTrustedProductionSource(job);
  });
}

export const keepOfficialJobs = keepProductionJobs;

function asModule(jobs, meta) {
  const jobsJson = JSON.stringify(jobs, null, 2).replace(/\n]$/, '\n];').replace(/]$/, '];');
  const metaJson = JSON.stringify(meta, null, 2).replace(/\n}$/, '\n};').replace(/}$/, '};');
  return `// AUTO-GENERATED by job discovery refresh; production pool keeps in-scope official sources plus university records backed by an explicit official career URL.\nexport const liveJobs = ${jobsJson}\n\nexport const discoveryMeta = ${metaJson}\n`;
}

async function main() {
  const mod = await import(`${pathToFileURL(livePath).href}?t=${Date.now()}`);
  const original = Array.isArray(mod.liveJobs) ? mod.liveJobs : [];
  const kept = keepProductionJobs(original);
  const excludedProfessional = original.filter((job) => !isCategoryHeadingCompany(job?.company) && isOutOfScopeProfessionalRole(job)).length;
  const excludedOther = original.filter((job) => isCategoryHeadingCompany(job?.company) || (!isOutOfScopeProfessionalRole(job) && !hasTrustedProductionSource(job))).length;
  const officialCount = kept.filter((job) => job?.sourceType === 'official').length;
  const universityBacked = kept.filter(isTrustedUniversityOfficialBacked).length;
  const companies = new Set(kept.map((job) => job.company).filter(Boolean));
  const existingMeta = mod.discoveryMeta || {};
  const meta = {
    ...existingMeta,
    updatedAt: new Date().toISOString(),
    source: '公司官方招聘官网/API + 高校就业网官方发布且明确给出公司官网投递入口的2027届记录',
    mode: '英语专业本科校招岗位情报池：公司official优先；高校官方发布+明确2027+公司官网投递入口可作为过渡候选；技术/设计/财务/会计/审计/税务/金融/法务/精算等明显专业岗位及硬性非英语专业门槛在生产池入库前排除；最终候选人排序与投递建议由CareerPilot负责',
    stats: {
      ...(existingMeta.stats || {}),
      totalJobs: kept.length,
      companies: companies.size,
      sourcePolicy: {
        production: 'english-major-scope+official-preferred+trusted-university-official-backed',
        official: officialCount,
        universityOfficialBacked: universityBacked,
        excludedProfessional,
        excludedOther
      }
    },
    note: `${existingMeta.note || ''} 生产池默认公司 official；高校就业网仅作为“官方发布 + 明确2027届 + 明确公司官方招聘入口”的受控补漏来源。明显专业岗位以及硬性限定非英语专业范围的岗位不进入生产池；复合专业条件按逗号/分号拆分，后置“优先”只软化其所在条件；若后文另有“专业对口/专业匹配”等硬约束，则回看前述专业范围并恢复为硬门槛。`.trim()
  };

  await fs.writeFile(livePath, asModule(kept, meta), 'utf8');
  console.log(`[production-source-policy] before=${original.length} after=${kept.length} official=${officialCount} universityOfficialBacked=${universityBacked} excludedProfessional=${excludedProfessional} excludedOther=${excludedOther} companies=${companies.size}`);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  await main();
}
