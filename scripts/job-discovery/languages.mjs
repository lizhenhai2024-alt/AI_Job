const PREFERRED_RX = /优先|优先考虑|加分项|加分|优势|preferred|nice\s*to\s*have|plus/i;
const ALTERNATIVE_RX = /(英语|英文|english).{0,28}(或|任选其一|任一|其中一种|至少一种|之一|二选一|or).{0,28}|(或|任选其一|任一|其中一种|至少一种|之一|二选一|or).{0,28}(英语|英文|english)/i;
const MANDATORY_RX = /必须|要求|需|须|应|具备|熟练|精通|流利|听说读写|可作为工作语言|作为工作语言|工作语言|母语|native|business\s*level|professional\s*proficiency|CET[-‑ ]?[46]|雅思|托福|IELTS|TOEFL|JLPT|TOPIK|DELF|DALF|DELE|TestDaF|Goethe|\b[BC][12]\b/i;

const LANGUAGE_RULES = [
  ['英语', /英语|英文|\bEnglish\b|CET[-‑ ]?[46]|雅思|托福|IELTS|TOEFL/i],
  ['日语', /日语|日文|\bJapanese\b|JLPT|\bN[1-5]\b/i],
  ['德语', /德语|德文|\bGerman\b|TestDaF|Goethe/i],
  ['法语', /法语|法文|\bFrench\b|DELF|DALF/i],
  ['西班牙语', /西班牙语|西语|\bSpanish\b|DELE/i],
  ['葡萄牙语', /葡萄牙语|葡语|\bPortuguese\b/i],
  ['俄语', /俄语|\bRussian\b/i],
  ['韩语', /韩语|韩文|\bKorean\b|TOPIK/i],
  ['意大利语', /意大利语|意语|\bItalian\b/i],
  ['阿拉伯语', /阿拉伯语|\bArabic\b/i],
  ['泰语', /泰语|\bThai\b/i],
  ['越南语', /越南语|\bVietnamese\b/i],
  ['印尼语', /印尼语|印度尼西亚语|\bIndonesian\b|Bahasa\s+Indonesia/i],
  ['马来语', /马来语|\bMalay\b/i],
  ['土耳其语', /土耳其语|\bTurkish\b/i],
  ['波兰语', /波兰语|\bPolish\b/i],
  ['荷兰语', /荷兰语|\bDutch\b/i],
  ['瑞典语', /瑞典语|\bSwedish\b/i],
  ['挪威语', /挪威语|\bNorwegian\b/i],
  ['丹麦语', /丹麦语|\bDanish\b/i],
  ['芬兰语', /芬兰语|\bFinnish\b/i],
  ['希腊语', /希腊语|\bGreek\b/i],
  ['捷克语', /捷克语|\bCzech\b/i],
  ['匈牙利语', /匈牙利语|\bHungarian\b/i],
  ['罗马尼亚语', /罗马尼亚语|\bRomanian\b/i],
  ['乌克兰语', /乌克兰语|\bUkrainian\b/i],
  ['希伯来语', /希伯来语|\bHebrew\b/i]
];

const MINOR_LANGUAGES = new Set(LANGUAGE_RULES.map(([name]) => name).filter((name) => name !== '英语'));

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function textOf(job = {}) {
  return [
    job.title,
    job.jobRequirements,
    job.requirement,
    job.jobDescription,
    job._searchText,
    job.description
  ].filter(Boolean).join('\n');
}

function splitClauses(text = '') {
  return String(text)
    .split(/[。；;\n]|(?=\d+[.、])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function detectLanguages(text = '') {
  const raw = String(text || '');
  return LANGUAGE_RULES.filter(([, rx]) => rx.test(raw)).map(([name]) => name);
}

function canonicalizeExisting(values = []) {
  const input = Array.isArray(values) ? values : values ? [values] : [];
  const canonical = [];
  for (const value of input) {
    const detected = detectLanguages(String(value));
    if (detected.length) canonical.push(...detected);
  }
  return unique(canonical);
}

export function analyzeLanguageRequirements(job = {}) {
  const title = String(job.title || '');
  const fullText = textOf(job);
  const detectedFromText = detectLanguages(fullText);
  const existing = canonicalizeExisting(job.languages);
  const languages = detectedFromText.length ? detectedFromText : existing;
  const mandatory = [];
  const preferred = [];

  const titleLanguages = detectLanguages(title).filter((name) => MINOR_LANGUAGES.has(name));
  if (titleLanguages.length) {
    if (PREFERRED_RX.test(title)) preferred.push(...titleLanguages);
    else mandatory.push(...titleLanguages);
  }

  const requirementText = [job.jobRequirements, job.requirement, job.jobDescription, job._searchText, job.description]
    .filter(Boolean)
    .join('\n');
  for (const clause of splitClauses(requirementText)) {
    const clauseLanguages = detectLanguages(clause);
    if (!clauseLanguages.length) continue;

    if (PREFERRED_RX.test(clause)) {
      preferred.push(...clauseLanguages);
      continue;
    }

    // “英语或日语均可”一类是可选组合，不把任一小语种单独标成硬门槛。
    if (ALTERNATIVE_RX.test(clause) && clauseLanguages.includes('英语') && clauseLanguages.some((name) => MINOR_LANGUAGES.has(name))) {
      continue;
    }

    if (MANDATORY_RX.test(clause)) mandatory.push(...clauseLanguages);
  }

  return {
    languages: unique(languages),
    mandatoryLanguages: unique(mandatory),
    preferredLanguages: unique(preferred.filter((name) => !mandatory.includes(name)))
  };
}

export function normalizeJobLanguages(job = {}) {
  const analysis = analyzeLanguageRequirements(job);
  return {
    ...job,
    languages: analysis.languages,
    mandatoryLanguages: analysis.mandatoryLanguages,
    preferredLanguages: analysis.preferredLanguages
  };
}
