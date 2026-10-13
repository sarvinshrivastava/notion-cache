const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('../test-support/helpers.cjs');

test('first read misses, second read is served from cache', async () => {
  const { app, notion } = makeApp();
  const first = await request(app).get('/api/database/db1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { results: [{ id: 'row-of-db1' }], _cached: false });

  const second = await request(app).get('/api/database/db1');
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { results: [{ id: 'row-of-db1' }], _cached: true });
  assert.equal(notion.calls.queryDatabase.db1, 1);
});

test('each database id gets its own rows, on miss and on hit', async () => {
  const { app } = makeApp();
  for (let i = 0; i < 2; i++) {
    const a = await request(app).get('/api/database/dba');
    const b = await request(app).get('/api/database/dbb');
    assert.deepEqual(a.body.results, [{ id: 'row-of-dba' }]);
    assert.deepEqual(b.body.results, [{ id: 'row-of-dbb' }]);
  }
});
