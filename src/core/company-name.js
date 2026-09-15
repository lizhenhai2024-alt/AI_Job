// Company-name normalisation used to decide whether a job, a risk profile and a
// company registry record refer to the same company. This lived in five places
// with four slightly different rule sets, which is how a risk profile could be
// attributed to the wrong company: the copy in company-risk.js had no minimum
// length while the copy in apply-link-guard.js did.
//
// The rules below are the union of what the callers needed: strip ranking emoji
// and suffixes, drop bracketed qualifiers, and drop punctuation so that
// 致欧家居科技股份有限公司, 致欧家居 and 致欧家居(深圳) all collapse together.
export function companyKey(value = '') {
  return String(value)
    .replace(/^[\s🔴🟢🔵✅❌⭐★•·]+/u, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/股份有限公司|集团有限公司|有限责任公司|有限公司|科技股份|集团|控股|中国/gi, '')
    .replace(/[\s·,.，、【】[\]:：;；&/_-]/g, '')
    .toLowerCase()
    .trim();
}

export function sameCompany(left, right) {
  const a = companyKey(left);
  const b = companyKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // Substring matching is only safe for names long enough to be distinctive.
  // Normalisation strips 中国/集团/有限…, so a short key such as 中国平安 -> 平安
  // would otherwise match every company whose name happens to contain it.
  return Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a));
}
