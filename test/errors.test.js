const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp, fakeNotion } = require('../test-support/helpers.cjs');

afterEach(() => mock.restoreAll());
const quiet = () => mock.method(console, 'error', () => {});

const enc = v => encodeURIComponent(v);

test('malformed or wrong-typed filter/sorts → 400, Notion untouched', async () => {
  const { app, notion } = makeApp();
  for (const q of [
    `filter=notjson`,
    `filter=${enc('[]')}`,
    `filter=null`,
    `sorts=null`,
    `sorts=${enc('{}')}`,
    `filter[a]=b`,
  ]) {
    const res = await request(app).get(`/api/database/db1?${q}`);
    assert.equal(res.status, 400, q);
    assert.deepEqual(res.body, { error: 'bad_request' }, q);
  }
  assert.equal(notion.calls.queryDatabase.db1, undefined);
});

test('valid filter and sorts are passed through', async () => {
  const { app, notion } = makeApp();
  const spy = mock.method(notion, 'queryDatabase');
  const filter = { property: 'Featured', checkbox: { equals: true } };
  const sorts = [{ property: 'Sort Order', direction: 'ascending' }];
  const res = await request(app).get(`/api/database/db1?filter=${enc(JSON.stringify(filter))}&sorts=${enc(JSON.stringify(sorts))}`);
  assert.equal(res.status, 200);
  assert.deepEqual(spy.mock.calls[0].arguments, ['db1', filter, sorts]);
});

test('unknown query params share one cache entry', async () => {
  const { app, notion } = makeApp();
  await request(app).get('/api/database/db1?x=1');
  const second = await request(app).get('/api/database/db1?x=2');
  assert.equal(second.body._cached, true);
  assert.equal(notion.calls.queryDatabase.db1, 1);
});

test('Notion 401/404/429/500 with nothing cached → 502 with a generic body', async () => {
  quiet();
  for (const status of [401, 404, 429, 500]) {
    const notion = fakeNotion({ fail: Object.assign(new Error(`secret detail ${status}`), { status }) });
    const { app } = makeApp({ notion });
    const res = await request(app).get('/api/database/db1');
    assert.equal(res.status, 502, String(status));
    assert.deepEqual(res.body, { error: 'upstream_unavailable' });
  }
});

test('a stale entry wins over a Notion error', async () => {
  quiet();
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const notion = fakeNotion();
  const { app } = makeApp({ notion });
  await request(app).get('/api/database/db1');
  mock.timers.tick(301 * 1000);
  notion.fail = Object.assign(new Error('unauthorized'), { status: 401 });
  const res = await request(app).get('/api/database/db1');
  assert.equal(res.status, 200);
  assert.equal(res.body._stale, true);
  mock.timers.reset();
});

test('malformed JSON body on POST → 400', async () => {
  const { app } = makeApp();
  const res = await request(app)
    .post('/api/cache/invalidate')
    .set('Content-Type', 'application/json')
    .send('{bad');
  assert.equal(res.status, 400);
});
