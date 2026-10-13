const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Cache, STALE_MAX_MS } = require('../src/cache');
const { createCachedFetcher } = require('../src/services/cached');
const { makeApp, fakeNotion } = require('../test-support/helpers.cjs');

afterEach(() => { mock.timers.reset(); mock.restoreAll(); });

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('stale copy is served when Notion fails after the TTL', async () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const notion = fakeNotion();
  const { app } = makeApp({ notion });
  await request(app).get('/api/database/db1');

  mock.timers.tick(301 * 1000);
  notion.fail = Object.assign(new Error('notion down'), { status: 502 });
  const res = await request(app).get('/api/database/db1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { results: [{ id: 'row-of-db1' }], _cached: true, _stale: true });
});

test('an entry more than 24 h past expiry is no longer served', async () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const notion = fakeNotion();
  const { app } = makeApp({ notion });
  await request(app).get('/api/database/db1');

  mock.timers.tick(300 * 1000 + STALE_MAX_MS + 1);
  notion.fail = Object.assign(new Error('notion down'), { status: 502 });
  assert.notEqual((await request(app).get('/api/database/db1')).status, 200);
});

test('expired entry is refetched once Notion is back', async () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const notion = fakeNotion();
  const { app } = makeApp({ notion });
  await request(app).get('/api/database/db1');
  mock.timers.tick(301 * 1000);
  const res = await request(app).get('/api/database/db1');
  assert.equal(res.body._cached, false);
  assert.equal(notion.calls.queryDatabase.db1, 2);
});

test('5 concurrent misses share one fetch', async () => {
  const getOrFetch = createCachedFetcher(new Cache());
  const d = deferred();
  let calls = 0;
  const fetcher = () => { calls += 1; return d.promise; };
  const all = Promise.all(Array.from({ length: 5 }, () => getOrFetch('k', 300, fetcher)));
  d.resolve('v');
  const results = await all;
  assert.equal(calls, 1);
  assert.ok(results.every(r => r.value === 'v'));
});

test('after a rejection the next call retries', async () => {
  const getOrFetch = createCachedFetcher(new Cache());
  await assert.rejects(getOrFetch('k', 300, async () => { throw new Error('boom'); }));
  const ok = await getOrFetch('k', 300, async () => 'v');
  assert.equal(ok.value, 'v');
});

test('invalidate during a fetch: the old fetch neither writes back nor evicts the newer one', async () => {
  const cache = new Cache();
  const getOrFetch = createCachedFetcher(cache);
  const d1 = deferred();
  const d2 = deferred();
  let calls = 0;

  const p1 = getOrFetch('k', 300, () => { calls += 1; return d1.promise; });
  cache.invalidate('k');
  const p2 = getOrFetch('k', 300, () => { calls += 1; return d2.promise; });

  d1.resolve('old');
  await p1;
  assert.equal(cache.get('k'), null, 'pre-invalidate result must not be written back');

  const p3 = getOrFetch('k', 300, () => { calls += 1; return Promise.resolve('dup'); });
  d2.resolve('new');
  assert.equal((await p2).value, 'new');
  assert.equal((await p3).value, 'new', 'third call joined the second fetch');
  assert.equal(calls, 2);
});

test('a refreshed key survives eviction at the cap', () => {
  const cache = new Cache({ maxEntries: 3 });
  cache.set('hot', 1, 300);
  cache.set('a', 1, 300);
  cache.set('b', 1, 300);
  cache.set('hot', 2, 300);
  cache.set('c', 1, 300);
  assert.equal(cache.get('hot').value, 2);
  assert.equal(cache.get('a'), null);
  assert.equal(cache.stats().size, 3);
});

test('two apps share neither in-flight fetches nor generation', async () => {
  const c1 = new Cache();
  const c2 = new Cache();
  const f1 = createCachedFetcher(c1);
  const f2 = createCachedFetcher(c2);
  let calls = 0;
  const d = deferred();
  const p1 = f1('k', 300, () => { calls += 1; return d.promise; });
  const p2 = f2('k', 300, () => { calls += 1; return d.promise; });
  c1.invalidate('k');
  assert.equal(c2.generation, 0);
  d.resolve('v');
  await Promise.all([p1, p2]);
  assert.equal(calls, 2);
  assert.equal(c2.get('k').value, 'v');
});

test('cleanup() keeps an expired entry until STALE_MAX_MS, then removes it', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const cache = new Cache();
  cache.set('k', 1, 300);
  mock.timers.tick(301 * 1000);
  cache.cleanup();
  assert.deepEqual(cache.get('k'), { value: 1, fresh: false });
  mock.timers.tick(STALE_MAX_MS);
  cache.cleanup();
  assert.equal(cache.store.size, 0);
});

test('clear() during an in-flight fetch: the old result is not written back', async () => {
  const cache = new Cache();
  const getOrFetch = createCachedFetcher(cache);
  const d = deferred();
  let count = 0;
  const fetcher = () => { count += 1; return count === 1 ? d.promise : Promise.resolve('new'); };
  const first = getOrFetch('k', 300, fetcher);
  cache.clear();
  d.resolve('old');
  await first;
  assert.equal(cache.get('k'), null);
  const next = await getOrFetch('k', 300, fetcher);
  assert.equal(next.value, 'new');
  assert.equal(count, 2);
});

test('a non-Error rejection with a stale copy still serves the stale copy', async () => {
  mock.method(console, 'warn', () => {});
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const cache = new Cache();
  const getOrFetch = createCachedFetcher(cache);
  await getOrFetch('k', 300, async () => 'v');
  mock.timers.tick(301 * 1000);
  const hit = await getOrFetch('k', 300, () => Promise.reject(undefined));
  assert.deepEqual(hit, { value: 'v', cached: true, stale: true });
});

test('a nullish rejection with no stale copy still becomes an Error, and a 502 via the app', async () => {
  mock.method(console, 'error', () => {});
  const getOrFetch = createCachedFetcher(new Cache());
  await assert.rejects(getOrFetch('k', 300, () => Promise.reject(undefined)), Error);
  const notion = fakeNotion();
  notion.queryDatabase = () => Promise.reject(undefined);
  const res = await request(makeApp({ notion }).app).get('/api/database/db1');
  assert.equal(res.status, 502);
});
