/**
 * Read-through cache over a Cache instance:
 * - a fresh hit is returned as is;
 * - concurrent misses for one key share a single fetch;
 * - if the fetch fails and an expired copy is still kept, that copy is served
 *   (`stale: true`) instead of the error.
 *
 * The in-flight map belongs to this fetcher, so two apps never share it.
 */
function createCachedFetcher(cache) {
  const inflight = new Map();
  cache.onInvalidate = key => {
    if (key === undefined) inflight.clear();
    else inflight.delete(key);
  };

  return async function getOrFetch(key, ttl, fetcher) {
    const hit = cache.get(key);
    if (hit?.fresh) return { value: hit.value, cached: true, stale: false };

    let pending = inflight.get(key);
    if (!pending) {
      const generation = cache.generation;
      const run = (async () => {
        const value = await fetcher();
        if (cache.generation === generation) cache.set(key, value, ttl);
        return value;
      })();
      // Only remove our own entry: an invalidate may have let a newer fetch in.
      pending = run.finally(() => { if (inflight.get(key) === pending) inflight.delete(key); });
      inflight.set(key, pending);
    }

    try {
      return { value: await pending, cached: false, stale: false };
    } catch (err) {
      const kept = cache.get(key);
      if (kept) return { value: kept.value, cached: true, stale: true };
      throw err;
    }
  };
}

/** Response fields that say where a getOrFetch result came from. */
const cacheMeta = ({ cached, stale }) => ({ _cached: cached, ...(stale && { _stale: true }) });

module.exports = { createCachedFetcher, cacheMeta };
