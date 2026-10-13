const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('../test-support/helpers.cjs');

afterEach(() => mock.restoreAll());

test('page and blocks are fetched once, then served from cache', async () => {
  mock.method(console, 'warn', () => {});
  const { app } = makeApp();
  const first = await request(app).get('/api/pages/p1');
  assert.deepEqual(first.body, { id: 'p1', object: 'page', _cached: false });
  assert.equal((await request(app).get('/api/pages/p1')).body._cached, true);

  const blocks = await request(app).get('/api/pages/p1/blocks');
  assert.deepEqual(blocks.body, { results: [{ id: 'block-of-p1' }], _cached: false });
});
