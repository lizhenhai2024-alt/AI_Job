// Node's fetch has no default timeout. A peer that accepts the connection and
// then stalls (no RST) hangs the promise forever, and refresh-jobs.mjs runs the
// whole refresh with MAX_CONCURRENCY = 3 — so one stalled socket permanently
// consumes a third of the pool and the scheduled run never reaches its write
// step, with nothing in the log to say why.
//
// This wrapper bounds BOTH halves of a request. The AbortController covers
// connect/headers and is deliberately left armed while the body is read, so
// `response.json()` / `.text()` are bounded too (clearing the timer as soon as
// headers arrive — which three adapters did by hand — leaves the body unbounded).
// The timer is released when the adapter finishes consuming the response.
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

// URLs read out of remote content (sitemap <loc>, robots.txt Sitemap:, crawled
// links) must not be fetched unless they belong to the site being indexed.
// Redirects are followed, so a hostile upstream — or an open redirect on the
// indexed site itself — can otherwise point the runner at arbitrary hosts
// (cloud metadata endpoints, localhost admin ports, internal DNS names).
export function isSameSite(url, allowedHosts = []) {
  if (!allowedHosts.length) return true;
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts.some((allowed) => {
    const base = String(allowed || '').toLowerCase().replace(/^\./, '');
    if (!base) return false;
    return host === base || host.endsWith(`.${base}`);
  });
}

const BODY_READERS = ['json', 'text', 'arrayBuffer', 'blob', 'formData'];

export function withTimeout(fetcher = fetch, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  if (typeof fetcher !== 'function' || !(timeoutMs > 0)) return fetcher;

  return async function fetchWithTimeout(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`request to ${String(url).slice(0, 120)} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    // Watchdog, not work: an adapter that abandons a response without reading the
    // body (e.g. it throws on !response.ok) would otherwise leave this timer armed
    // and hold the process open for the rest of the timeout.
    if (typeof timer.unref === 'function') timer.unref();

    // Honour a caller-supplied signal instead of discarding it.
    const upstream = init.signal;
    const forwardAbort = () => controller.abort(upstream?.reason);
    if (upstream) {
      if (upstream.aborted) forwardAbort();
      else upstream.addEventListener('abort', forwardAbort, { once: true });
    }

    const release = () => {
      clearTimeout(timer);
      if (upstream) upstream.removeEventListener('abort', forwardAbort);
    };

    let response;
    try {
      response = await fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      release();
      throw error;
    }

    for (const method of BODY_READERS) {
      if (typeof response?.[method] !== 'function') continue;
      const original = response[method].bind(response);
      Object.defineProperty(response, method, {
        configurable: true,
        writable: true,
        value: (...args) => {
          try {
            return Promise.resolve(original(...args)).finally(release);
          } catch (error) {
            release();
            return Promise.reject(error);
          }
        }
      });
    }

    return response;
  };
}
