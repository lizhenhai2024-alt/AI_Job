import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, isSameSite } from '../scripts/job-discovery/http.mjs';

const never = (url, init = {}) => new Promise((_, reject) => {
  if (init.signal) {
    init.signal.addEventListener('abort', () => reject(init.signal.reason ?? new Error('aborted')), { once: true });
  }
});

test('withTimeout aborts a request that never responds', async () => {
  const fetcher = withTimeout(never, 20);
  await assert.rejects(() => fetcher('https://example.invalid/stall'), /timed out after 20ms/);
});

test('withTimeout keeps the timer armed while the body is being read', async () => {
  // Headers arrive immediately, the body never finishes: a timer cleared on the
  // response alone would leave this hanging forever.
  const fetcher = withTimeout(async (url, init = {}) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        init.signal?.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      }
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  }, 20);

  const response = await fetcher('https://example.invalid/slow-body');
  await assert.rejects(() => response.json(), /timed out after 20ms/);
});

test('withTimeout releases the timer once the body is consumed', async () => {
  let calls = 0;
  const fetcher = withTimeout(async () => {
    calls++;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, 20);

  const response = await fetcher('https://example.invalid/fast');
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls, 1);
  // The pending timer must be gone, otherwise the test process would linger.
  await new Promise((resolve) => setTimeout(resolve, 40));
});

test('withTimeout forwards a caller-supplied signal', async () => {
  const controller = new AbortController();
  const fetcher = withTimeout(never, 5000);
  const pending = fetcher('https://example.invalid/abortable', { signal: controller.signal });
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(() => pending, /caller cancelled/);
});

test('withTimeout passes non-response values and returning fetch unchanged through', async () => {
  const passthrough = (url) => Promise.resolve({ url, ok: true });
  const fetcher = withTimeout(passthrough, 100);
  assert.deepEqual(await fetcher('https://example.invalid/x'), { url: 'https://example.invalid/x', ok: true });
  const plain = () => 'not-a-function-timeout';
  assert.equal(withTimeout(plain, 0), plain);
});
