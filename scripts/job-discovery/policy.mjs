export function isInternshipJob(job = {}) {
  const title = String(job?.title || '');
  return /实习生|日常实习|暑期实习|实习岗位|\bIntern(?:ship)?\b/i.test(title);
}
