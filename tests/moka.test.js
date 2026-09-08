import test from 'node:test';
import assert from 'node:assert/strict';
import { mokaJobsUrl, mokaJobUrl, parseMokaInitData, parseMokaCard, resolveMokaGraduationYear, isMokaTitleAllowed } from '../scripts/job-discovery/moka.mjs';

test('Moka campus portal is normalized to the jobs hash route', () => {
  assert.equal(
    mokaJobsUrl('https://app.mokahr.com/campus_apply/aftershokzhr/36940?recommendCode=abc#/home'),
    'https://app.mokahr.com/campus_apply/aftershokzhr/36940?recommendCode=abc#/jobs'
  );
});

test('Moka detail URL uses singular job hash route', () => {
  assert.equal(
    mokaJobUrl('https://app.mokahr.com/campus-recruitment/demo/123#/jobs', 'abc-123'),
    'https://app.mokahr.com/campus-recruitment/demo/123#/job/abc-123'
  );
});

test('parses SSR init-data jobs from HTML-escaped input value', () => {
  const data = {
    aesIv: '1234567890abcdef',
    jobs: [{ id: 'j1', title: '海外产品运营', locations: [{ cityName: '深圳' }] }]
  };
  const escaped = JSON.stringify(data).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const html = `<html><body><input id="init-data" value="${escaped}"></body></html>`;
  const parsed = parseMokaInitData(html);
  assert.equal(parsed.jobs.length, 1);
  assert.equal(parsed.jobs[0].title, '海外产品运营');
  assert.equal(parsed.jobs[0].locations[0].cityName, '深圳');
});

test('Moka explicit non-2027 cohort cannot inherit configured 2027', () => {
  assert.equal(resolveMokaGraduationYear('2026届秋招 海外市场运营', '2027'), '');
  const job = parseMokaCard({
    company: '示例企业',
    title: '海外市场运营（2026届）',
    text: '负责海外市场和跨文化沟通',
    url: 'https://app.mokahr.com/campus-recruitment/demo/1#/job/old',
    graduationYear: '2027'
  });
  assert.equal(job.graduationYear, '');
  assert.match(job.verification, /届别冲突/);
});

test('Moka explicit 2027 or no-year card resolves to configured cohort', () => {
  assert.equal(resolveMokaGraduationYear('【2027届秋招】产品运营', '2027'), '2027');
  assert.equal(resolveMokaGraduationYear('海外产品运营 深圳', '2027'), '2027');
});

test('Moka mixed internship and pure-sales titles are blocked', () => {
  for (const title of ['招聘专员-校招/实习', '海外运营实习生', '销售管培生-成都']) {
    assert.equal(isMokaTitleAllowed(title), false, title);
  }
  assert.equal(isMokaTitleAllowed('海外GTM管培生'), true);
});
