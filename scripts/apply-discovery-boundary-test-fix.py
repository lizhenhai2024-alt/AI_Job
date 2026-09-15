from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, got {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')


replace_once(
    'tests/beisen.test.js',
    """  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '海外业务岗(J13645)');
  assert.equal(result.jobs[0].city, '国外');
  assert.equal(result.jobs[0].salary, '14-18 万元/年');
  assert.ok(result.jobs[0].languages.includes('英语'));
  assert.match(result.jobs[0].verification, /已核验2027届秋季全球校园招聘/);
  assert.match(result.jobs[0].sourceUrl, /gmkgxzxq\\?jobId=311179882/);""",
    """  assert.equal(result.jobs.length, 2);
  const overseas = result.jobs.find((job) => job.title === '海外业务岗(J13645)');
  const research = result.jobs.find((job) => job.title === '行业研究岗(J13649)');
  assert.ok(overseas);
  assert.ok(research);
  assert.equal(overseas.city, '国外');
  assert.equal(overseas.salary, '14-18 万元/年');
  assert.ok(overseas.languages.includes('英语'));
  assert.match(overseas.verification, /已核验2027届秋季全球校园招聘/);
  assert.match(overseas.sourceUrl, /gmkgxzxq\\?jobId=311179882/);"""
)

replace_once(
    'tests/ecoflow.test.js',
    """  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'GTM');""",
    """  assert.equal(result.jobs.length, 2);
  assert.deepEqual(new Set(result.jobs.map((job) => job.title)), new Set(['GTM', '嵌入式软件工程师']));"""
)

replace_once(
    'tests/oppo.test.js',
    """  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, '产品营销经理（海外-小语种）');""",
    """  assert.equal(result.jobs.length, 2);
  assert.deepEqual(
    new Set(result.jobs.map((job) => job.title)),
    new Set(['产品营销经理（海外-小语种）', '电池算法工程师'])
  );"""
)

print('provider fixture expectations updated')
# retrigger marker: 2026-09-16
