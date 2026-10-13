const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

/**
 * Expired entries are kept for STALE_MAX_MS so they can be served when Notion
 * is down. `get` says whether an entry is still fresh.
 *
 * `generation` changes on every invalidate/clear: an in-flight fetch that
 * started before it must not write its (now outdated) result back.
 */
class Cache {
  constructor({ maxEntries = MAX_ENTRIES, staleMaxMs = STALE_MAX_MS } = {}) {
    this.store = new Map();
    this.maxEntries = maxEntries;
    this.staleMaxMs = staleMaxMs;
    this.generation = 0;
    this.onInvalidate = null;
  }
  set(key, value, ttlSeconds) {
    // Delete first so a rewritten key moves to the end: eviction then drops the
    // least recently written key, never the hot ones refreshed every TTL.
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value);
    }
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now > entry.expiresAt + this.staleMaxMs) { this.store.delete(key); return null; }
    return { value: entry.value, fresh: now <= entry.expiresAt };
  }
  invalidate(key) {
    this.store.delete(key);
    this.generation += 1;
    this.onInvalidate?.(key);
  }
  clear() {
    this.store.clear();
    this.generation += 1;
    this.onInvalidate?.();
  }
  cleanup() {
    const cutoff = Date.now() - this.staleMaxMs;
    for (const [k, e] of this.store.entries()) if (e.expiresAt < cutoff) this.store.delete(k);
  }
  stats() { return { size: this.store.size, keys: [...this.store.keys()] }; }
}

module.exports = { Cache, STALE_MAX_MS, MAX_ENTRIES };
