function textOf(job = {}) {
  return [job?.title, job?._searchText, job?.description]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ');
}

export function isInternshipJob(job = {}) {
  const title = String(job?.title || '');
  return /实习生|日常实习|暑期实习|实习岗位|\bIntern(?:ship)?\b/i.test(title);
}

export function isEngineeringOrImplementationJob(job = {}) {
  const title = String(job?.title || '');
  return /工程师|实施/.test(title);
}

const STEM_RX = /理工科|工科|理科|计算机|软件工程|电子信息|电子工程|自动化|机械|电气|通信|数学|统计|物理|化学|材料|车辆工程|能源|控制工程|人工智能|数据科学/i;
const PREFERRED_RX = /优先|优先考虑|加分项|加分|preferred|plus/i;
const FLEXIBLE_RX = /专业不限|不限专业|专业不限制|不限制专业/i;
const MANDATORY_RX = /必须|要求|限|仅限|需具备|需要具备|专业要求|相关专业|专业背景|应为|须为|本科.*专业|硕士.*专业/i;

function splitRequirementClauses(text = '') {
  return String(text)
    .split(/[。；;\n]|(?=\d+[.、])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requiresMandatoryStem(job = {}) {
  const text = textOf(job);
  if (!STEM_RX.test(text)) return false;

  for (const clause of splitRequirementClauses(text)) {
    if (!STEM_RX.test(clause)) continue;
    // “专业不限，理工科优先”“计算机背景优先”等只作为偏好，不淘汰。
    if (PREFERRED_RX.test(clause) || FLEXIBLE_RX.test(clause)) continue;
    // “理工科相关专业”“要求计算机/电子/自动化专业”等视为硬门槛。
    if (MANDATORY_RX.test(clause)) return true;
  }
  return false;
}

export function jobPolicyReasons(job = {}) {
  const reasons = [];
  if (isInternshipJob(job)) reasons.push('实习岗位');
  if (isEngineeringOrImplementationJob(job)) reasons.push('工程师/实施岗位');
  if (requiresMandatoryStem(job)) reasons.push('必须理工科/技术专业');
  if (job?.riskTags?.includes('纯销售')) reasons.push('纯销售');
  return reasons;
}

export function shouldExcludeByPolicy(job = {}) {
  return jobPolicyReasons(job).length > 0;
}
