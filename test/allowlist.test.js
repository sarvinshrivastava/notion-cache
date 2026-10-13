const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp } = require('../test-support/helpers.cjs');
const { parseAllowedDbIds } = require('../src/config');

const ID = '9ffc9aed7f2444018df81807060aab3e';
const DASHED_UPPER = '9FFC9AED-7F24-4401-8DF8-1807060AAB3E';

test('allowlisted id → 200, any other id → 404 without calling Notion', async () => {
  const { app, notion } = makeApp({ allowedDbIds: [ID] });
  assert.equal((await request(app).get(`/api/database/${ID}`)).status, 200);
  const other = await request(app).get('/api/database/deadbeef');
  assert.equal(other.status, 404);
  assert.deepEqual(other.body, { error: 'not_found' });
  assert.equal(notion.calls.queryDatabase.deadbeef, undefined);
});

test('dashed / upper-case spelling of an allowed id is served from the same entry', async () => {
  const { app, notion } = makeApp({ allowedDbIds: [ID] });
  const a = await request(app).get(`/api/database/${ID}`);
  const b = await request(app).get(`/api/database/${DASHED_UPPER}`);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(b.body._cached, true);
  assert.equal(notion.calls.queryDatabase[ID], 1);
});

test('allowlist on → every page route is 404', async () => {
  const { app, notion } = makeApp({ allowedDbIds: [ID] });
  assert.equal((await request(app).get('/api/pages/x')).status, 404);
  assert.equal((await request(app).get('/api/pages/x/blocks')).status, 404);
  assert.equal(notion.calls.getPage, 0);
});

test('allowlist unset → any id and pages still served, with a warning', async () => {
  const warn = mock.method(console, 'warn', () => {});
  const { app } = makeApp();
  assert.equal(warn.mock.callCount(), 1);
  assert.equal((await request(app).get('/api/database/anything')).status, 200);
  assert.equal((await request(app).get('/api/pages/x')).status, 200);
  warn.mock.restore();
});

test('env parsing: either name, empty stripped name falls through, ids normalised', () => {
  assert.deepEqual(parseAllowedDbIds({ ALLOWED_DB_IDS: ` ${DASHED_UPPER} , b ` }), [ID, 'b']);
  assert.deepEqual(parseAllowedDbIds({ ALLOWED_DB_IDS: '', NOTION_CACHE_ALLOWED_DB_IDS: ID }), [ID]);
  assert.deepEqual(parseAllowedDbIds({}), []);
});

test('allowlist on → filter or sorts is 400 without calling Notion', async () => {
  const { app, notion } = makeApp({ allowedDbIds: [ID] });
  for (const q of ['filter=%7B%7D', 'sorts=%5B%5D']) {
    const res = await request(app).get(`/api/database/${ID}?${q}`);
    assert.equal(res.status, 400, q);
    assert.deepEqual(res.body, { error: 'bad_request' });
  }
  assert.equal(notion.calls.queryDatabase[ID], undefined);
});
