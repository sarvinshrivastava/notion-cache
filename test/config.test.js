const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parseTtl, optionsFromEnv } = require('../src/config');
const { makeApp } = require('../test-support/helpers.cjs');

afterEach(() => mock.restoreAll());

test('TTL parse: 0 is kept, bad or empty values fall back to 300', () => {
  assert.equal(parseTtl({ CACHE_TTL_SECONDS: '0' }), 0);
  assert.equal(parseTtl({ CACHE_TTL_SECONDS: '120' }), 120);
  for (const v of [undefined, '', '  ', '-5', 'abc']) {
    assert.equal(parseTtl({ CACHE_TTL_SECONDS: v }), 300, String(v));
  }
});

test('/health reports size but no keys', async () => {
  const { app } = makeApp();
  await request(app).get('/api/database/db1');
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.cache, { size: 1 });
});

test('notion.js refuses to load without NOTION_TOKEN outside tests', () => {
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.NOTION_TOKEN;
  const r = spawnSync(process.execPath, ['-e', "require('./src/notion')"], {
    cwd: path.join(__dirname, '..'),
    env,
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /NOTION_TOKEN missing/);
});

test('optionsFromEnv maps env to ttl and allowedDbIds', () => {
  assert.deepEqual(optionsFromEnv({ CACHE_TTL_SECONDS: '0', ALLOWED_DB_IDS: 'A-b, c' }), { ttl: 0, allowedDbIds: ['ab', 'c'] });
  assert.deepEqual(optionsFromEnv({}), { ttl: 300, allowedDbIds: [] });
});

test('/health reports whether the allowlist is on', async () => {
  mock.method(console, 'warn', () => {});
  const off = await request(makeApp().app).get('/health');
  const on = await request(makeApp({ allowedDbIds: ['abc'] }).app).get('/health');
  assert.equal(off.headers['x-powered-by'], undefined);
  assert.equal(off.body.allowlist, false);
  assert.equal(on.body.allowlist, true);
});
