class Cache {
  constructor() { this.store = new Map(); }
  set(key, value, ttlSeconds) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }
  invalidate(key) { this.store.delete(key); }
  cleanup() {
    const now = Date.now();
    for (const [k, e] of this.store.entries()) if (now > e.expiresAt) this.store.delete(k);
  }
  stats() { return { size: this.store.size, keys: [...this.store.keys()] }; }
}
module.exports = new Cache();
