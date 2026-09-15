// discoveryMeta.note is built by every writer of live-jobs.js: each stage appends
// its own rule sentence to whatever the previous stage left. Appending blindly is
// not idempotent — the standalone entry points (`npm run enrich:compensation`,
// re-running a single stage to repair data) would duplicate their sentence on
// every run, so the committed note grows without bound.
//
// Each sentence is therefore kept at most once. Order is preserved: the first
// occurrence wins, and a re-append moves the sentence to the end.
export function appendMetaNote(existingNote = '', sentence = '') {
  const text = String(sentence || '').trim();
  const kept = String(existingNote || '')
    .split(text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return kept;
  return `${kept} ${text}`.trim();
}
