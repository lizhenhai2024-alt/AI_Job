import test from 'node:test';
import assert from 'node:assert/strict';
import { mokaJobsUrl, mokaJobUrl, parseMokaInitData } from '../scripts/job-discovery/moka.mjs';

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
