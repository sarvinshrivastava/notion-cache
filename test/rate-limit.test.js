const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('../test-support/helpers.cjs');

const remaining = res => Number(res.headers['x-ratelimit-remaining']);

test('clients behind the proxy get separate rate-limit buckets', async () => {
  const { app } = makeApp();
  const a1 = await request(app).get('/api/database/db1').set('X-Forwarded-For', '203.0.113.1');
  const a2 = await request(app).get('/api/database/db1').set('X-Forwarded-For', '203.0.113.1');
  const b1 = await request(app).get('/api/database/db1').set('X-Forwarded-For', '203.0.113.2');

  for (const r of [a1, a2, b1]) assert.ok(Number.isFinite(remaining(r)), 'rate-limit header missing');
  assert.equal(Number(a1.headers['x-ratelimit-limit']), 100);
  assert.equal(remaining(a2), remaining(a1) - 1);
  assert.equal(remaining(b1), remaining(a1));
});
