import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameSite } from '../scripts/job-discovery/http.mjs';
import { discoverJobUrls, fetchText, NOWCODER_HOSTS } from '../scripts/job-discovery/nowcoder.mjs';

test('isSameSite accepts the host and its subdomains only', () => {
  assert.equal(isSameSite('https://www.nowcoder.com/a', NOWCODER_HOSTS), true);
  assert.equal(isSameSite('https://nowcoder.com/a', NOWCODER_HOSTS), true);
  assert.equal(isSameSite('https://jobs.nowcoder.com/a', NOWCODER_HOSTS), true);
  assert.equal(isSameSite('https://nowcoder.com.evil.example/a', NOWCODER_HOSTS), false);
  assert.equal(isSameSite('https://evil.example/a', NOWCODER_HOSTS), false);
  assert.equal(isSameSite('not a url', NOWCODER_HOSTS), false);
});

test('isSameSite is a no-op when no hosts are configured', () => {
  assert.equal(isSameSite('https://anything.example/a', []), true);
});

test('fetchText refuses an off-site URL before making a request', async () => {
  await assert.rejects(
    () => fetchText('http://169.254.169.254/latest/meta-data/', { allowedHosts: NOWCODER_HOSTS }),
    /refusing off-site fetch/
  );
});

test('discoverJobUrls drops sitemap entries pointing at other hosts', async () => {
  const fixtures = new Map([
    ['https://www.nowcoder.com/robots.txt', 'User-agent: *\nSitemap: https://www.nowcoder.com/root-sitemap.xml'],
    ['https://www.nowcoder.com/root-sitemap.xml',
      '<sitemapindex>' +
      '<sitemap><loc>https://www.nowcoder.com/jobs-sitemap.xml</loc></sitemap>' +
      '<sitemap><loc>http://169.254.169.254/latest/meta-data/</loc></sitemap>' +
      '</sitemapindex>'],
    ['https://www.nowcoder.com/jobs-sitemap.xml',
      '<urlset>' +
      '<url><loc>https://www.nowcoder.com/jobs/detail/123</loc><lastmod>2026-09-08</lastmod></url>' +
      '<url><loc>https://evil.example/jobs/detail/999</loc></url>' +
      '</urlset>']
  ]);
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    if (!fixtures.has(url)) throw new Error(`unexpected fetch: ${url}`);
    return fixtures.get(url);
  };

  const urls = await discoverJobUrls({ fetcher, maxSitemaps: 5, maxCandidates: 10 });
  assert.deepEqual(urls.map((u) => u.url), ['https://www.nowcoder.com/jobs/detail/123']);
  assert.deepEqual(requested, [
    'https://www.nowcoder.com/robots.txt',
    'https://www.nowcoder.com/root-sitemap.xml',
    'https://www.nowcoder.com/jobs-sitemap.xml'
  ]);
});
