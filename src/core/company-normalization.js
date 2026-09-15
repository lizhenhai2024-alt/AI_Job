const LEADING_MARKS_RX = /^[\s🔴🟢🔵✅❌⭐★•·]+/u;
const LEGAL_SUFFIXES = [
  '股份有限公司', '集团有限公司', '有限责任公司', '有限公司',
  '股份公司', '集团公司', '集团', '控股'
];
const DESCRIPTOR_SUFFIXES = ['新能源科技', '新能源技术', '新能源', '科技', '技术', '动力'];
const ALIASES = new Map([
  ['catl', '宁德时代'],
  ['宁德时代新能源科技', '宁德时代']
]);

function stripLegalSuffixes(value = '') {
  let text = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (text.endsWith(suffix)) {
        text = text.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return text;
}

function stripSafeDescriptorSuffix(value = '') {
  let text = value;
  for (const suffix of DESCRIPTOR_SUFFIXES) {
    if (!text.endsWith(suffix)) continue;
    const base = text.slice(0, -suffix.length);
    // Only collapse generic descriptor suffixes when a sufficiently specific
    // company stem remains. This avoids global removals such as 科技创新 -> 创新.
    if (base.length >= 4) return base;
  }
  return text;
}

export function canonicalCompanyKey(value = '') {
  let text = String(value || '')
    .replace(LEADING_MARKS_RX, '')
    .replace(/[（(].*?[）)]/g, '')
    .trim();

  text = stripLegalSuffixes(text)
    .replace(/中国$/i, '')
    .replace(/app$/i, '')
    .replace(/[\s·,.，、【】\[\]：:;；&/_-]/g, '')
    .toLowerCase()
    .trim();

  text = stripSafeDescriptorSuffix(text);
  return ALIASES.get(text) || text;
}

export function sameCanonicalCompany(left = '', right = '') {
  const a = canonicalCompanyKey(left);
  const b = canonicalCompanyKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a));
}
