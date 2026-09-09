const base = 'https://nio.jobs.feishu.cn';
const headers = {
  'content-type': 'application/json',
  accept: 'application/json',
  'accept-language': 'zh-CN,zh;q=0.9',
  'user-agent': 'Mozilla/5.0',
  referer: `${base}/index/`,
  'website-path': 'index'
};

function localized(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return String(value.zh_cn || value.i18n || value.en_us || value.name || value.value || '');
  return '';
}

function inc(map, key) {
  const label = String(key || '(空)').trim() || '(空)';
  map.set(label, (map.get(label) || 0) + 1);
}

const rows = [];
for (let offset = 0; offset < 3000; offset += 100) {
  const res = await fetch(`${base}/api/v1/search/job/posts`, { method: 'POST', headers, body: JSON.stringify({ limit: 100, offset }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (Number(payload?.code) !== 0) throw new Error(`API code ${payload?.code}: ${payload?.message || ''}`);
  const posts = payload?.data?.job_post_list || [];
  rows.push(...posts);
  if (posts.length < 100 || rows.length >= Number(payload?.data?.count || 0)) break;
}

const subjects = new Map();
const recruitTypes = new Map();
const recruitParents = new Map();
const functions = new Map();
const categories = new Map();
for (const row of rows) {
  inc(subjects, localized(row?.subject?.name || row?.job_subject?.name || row?.recruitment?.name));
  inc(recruitTypes, localized(row?.recruit_type?.name));
  inc(recruitParents, localized(row?.recruit_type?.parent?.name));
  inc(functions, localized(row?.job_function?.name));
  inc(categories, localized(row?.job_category?.name));
}

const top = (map, n = 40) => [...map.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0,n);
console.log(`NIO rows=${rows.length}`);
console.log('ROW_KEYS', Object.keys(rows[0] || {}).sort().join(','));
console.log('SUBJECTS', JSON.stringify(top(subjects, 80), null, 2));
console.log('RECRUIT_TYPES', JSON.stringify(top(recruitTypes, 30), null, 2));
console.log('RECRUIT_PARENTS', JSON.stringify(top(recruitParents, 30), null, 2));
console.log('FUNCTIONS', JSON.stringify(top(functions, 80), null, 2));
console.log('CATEGORIES', JSON.stringify(top(categories, 80), null, 2));

const likely = rows.filter((row) => {
  const title = localized(row?.title);
  const subject = localized(row?.subject?.name || row?.job_subject?.name || row?.recruitment?.name);
  const rt = localized(row?.recruit_type?.name);
  const parent = localized(row?.recruit_type?.parent?.name);
  const text = `${title} ${subject} ${rt} ${parent}`;
  return /2027|27届|校园|校招|应届|正式批|秋招/i.test(text) && !/实习|intern/i.test(text);
});
console.log(`LIKELY_NON_INTERN_2027=${likely.length}`);
for (const row of likely.slice(0,120)) {
  console.log('CANDIDATE', JSON.stringify({
    id: row?.id,
    title: localized(row?.title),
    subject: localized(row?.subject?.name || row?.job_subject?.name || row?.recruitment?.name),
    recruitType: localized(row?.recruit_type?.name),
    recruitParent: localized(row?.recruit_type?.parent?.name),
    function: localized(row?.job_function?.name),
    category: localized(row?.job_category?.name)
  }));
}
