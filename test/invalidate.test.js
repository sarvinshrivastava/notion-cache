const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('../test-support/helpers.cjs');

const SECRET = 's3cret';
let saved;
beforeEach(() => { saved = process.env.INVALIDATE_SECRET; process.env.INVALIDATE_SECRET = SECRET; });
afterEach(() => {
  if (saved === undefined) delete process.env.INVALIDATE_SECRET;
  else process.env.INVALIDATE_SECRET = saved;
});

function seeded() {
  const ctx = makeApp();
  ctx.cache.set('a', 1, 300);
  ctx.cache.set('b', 2, 300);
  return ctx;
}

test('secret unset → 401 even without a header, cache untouched', async () => {
  delete process.env.INVALIDATE_SECRET;
  const { app, cache } = seeded();
  const res = await request(app).post('/api/cache/invalidate');
  assert.equal(res.status, 401);
  assert.equal(cache.get('a').value, 1);
});

test('wrong or missing secret → 401', async () => {
  const { app, cache } = seeded();
  assert.equal((await request(app).post('/api/cache/invalidate')).status, 401);
  assert.equal(
    (await request(app).post('/api/cache/invalidate').set('x-invalidate-secret', 'nope')).status,
    401,
  );
  assert.equal(cache.get('a').value, 1);
});

test('right secret with a key removes only that key', async () => {
  const { app, cache } = seeded();
  const res = await request(app).post('/api/cache/invalidate?key=a').set('x-invalidate-secret', SECRET);
  assert.equal(res.status, 200);
  assert.equal(cache.get('a'), null);
  assert.equal(cache.get('b').value, 2);
});

test('right secret without a key clears every entry, fresh ones included', async () => {
  const { app, cache } = seeded();
  const res = await request(app).post('/api/cache/invalidate').set('x-invalidate-secret', SECRET);
  assert.deepEqual(res.body, { cleared: true });
  assert.equal(cache.stats().size, 0);
});

test('a non-string key → 400', async () => {
  const { app, cache } = seeded();
  const res = await request(app).post('/api/cache/invalidate?key=a&key=b').set('x-invalidate-secret', SECRET);
  assert.equal(res.status, 400);
  assert.equal(cache.get('a').value, 1);
});
