const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { makeApp, fakeNotion } = require('../test-support/helpers.cjs');
const { createStore } = require('../src/resume/store');
const { createResumeService } = require('../src/resume/service');
const { renderPdf } = require('../src/resume/render');

const dbIds = {
  about: 'dba', projects: 'dbp', timeline: 'dbt', experience: 'dbe',
};
const rt = text => [{ plain_text: text }];
const rowsFor = (bio = 'Hello') => ({
  dba: [{ properties: { Bio: { rich_text: rt(bio) } } }],
  dbp: [{ properties: { Name: { title: rt('Site') }, Featured: { checkbox: true } } }],
  dbt: [{ properties: { Name: { title: rt('Won') }, Category: { select: { name: 'Achievement' } } } }],
  dbe: [{ properties: { Name: { title: rt('Habuild') }, 'Start Date': { date: { start: '2025-10-01' } } } }],
});
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'resume-routes-'));
const AUTH = { Authorization: 'Bearer t' };

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

/** An app with a resume service over a temp store; every piece can be swapped. */
function setup(opts = {}) {
  const notion = opts.notion ?? fakeNotion({ rows: rowsFor() });
  const dir = opts.dir ?? tmpDir();
  const store = opts.store ?? createStore(dir);
  const renders = { n: 0 };
  const render = opts.render ?? (async r => { renders.n += 1; return renderPdf(r); });
  const service = createResumeService({
    notion, store, dbIds: opts.dbIds ?? dbIds, render, version: opts.version,
  });
  const token = opts.token ?? 't';
  const ctx = makeApp({ notion, resume: { service, token } });
  return { ...ctx, notion, dir, store, service, renders, render };
}
const post = (app, headers = AUTH) => request(app).post('/update-resume').set(headers);
const queries = notion => Object.values(notion.calls.queryDatabase).reduce((a, b) => a + b, 0);

test('auth and config: 401 without or with a wrong token; 503 when unconfigured', async () => {
  const { app } = setup();
  assert.equal((await request(app).post('/update-resume')).status, 401);
  assert.deepEqual((await post(app, { Authorization: 'Bearer nope' })).body, { error: 'unauthorized' });
  const noToken = setup({ token: '' });
  const r = await post(noToken.app);
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: 'not_configured' });
  const noDb = setup({ dbIds: { ...dbIds, projects: '' } });
  assert.equal((await post(noDb.app)).status, 503);
  assert.equal(queries(noDb.notion), 0);
});

test('first update renders; GET serves it with the exact headers and a sha256 ETag', async () => {
  const { app } = setup();
  const up = await post(app);
  assert.equal(up.status, 200);
  assert.equal(up.body.updated, true);
  assert.match(up.body.hash, /^[0-9a-f]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(up.body.renderedAt)));
  const res = await request(app).get('/resume.pdf').buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.equal(res.headers['content-disposition'], 'inline; filename="Sarvin-Shrivastava-Resume.pdf"');
  assert.equal(res.headers['x-robots-tag'], 'noindex');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['content-security-policy'], undefined);
  assert.equal(res.headers['cache-control'], 'public, max-age=0, must-revalidate');
  assert.equal(res.headers['netlify-cdn-cache-control'], 'public, durable, max-age=300, stale-while-revalidate=86400');
  assert.equal(res.headers.etag, `"${sha(res.body)}"`);
});

test('a second call is a no-op that still queries Notion; changed rows and a new version re-render', async () => {
  const ctx = setup();
  const first = (await post(ctx.app)).body;
  assert.equal(queries(ctx.notion), 4);
  const second = (await post(ctx.app)).body;
  assert.equal(second.updated, false);
  assert.equal(second.hash, first.hash);
  assert.equal(second.renderedAt, first.renderedAt);
  assert.equal(queries(ctx.notion), 8);
  assert.equal(ctx.renders.n, 1);

  const etag1 = (await request(ctx.app).get('/resume.pdf')).headers.etag;
  const changed = rowsFor('A different bio');
  const orig = ctx.notion.queryDatabase;
  ctx.notion.queryDatabase = id => (id === 'dba' ? Promise.resolve(changed.dba) : orig(id));
  const third = (await post(ctx.app)).body;
  assert.equal(third.updated, true);
  assert.notEqual(third.hash, first.hash);
  assert.notEqual((await request(ctx.app).get('/resume.pdf')).headers.etag, etag1);

  const v2 = setup({ dir: ctx.dir, version: 'v2' });
  assert.equal((await post(v2.app)).body.updated, true);
});

test('failures: a Notion rejection, a validation_error and a throwing store answer 502 and keep the old PDF', async () => {
  const ctx = setup();
  await post(ctx.app);
  const etag = (await request(ctx.app).get('/resume.pdf')).headers.etag;

  ctx.notion.fail = new Error('notion down');
  let r = await post(ctx.app);
  assert.equal(r.status, 502);
  assert.deepEqual(r.body, { error: 'upstream_unavailable' });

  ctx.notion.fail = Object.assign(new Error('bad'), { code: 'validation_error' });
  assert.equal((await post(ctx.app)).status, 502);
  ctx.notion.fail = null;

  const realWrite = ctx.store.writeSync;
  ctx.store.writeSync = () => { throw new Error('disk full'); };
  const orig = ctx.notion.queryDatabase;
  ctx.notion.queryDatabase = id => (id === 'dba' ? Promise.resolve(rowsFor('changed again').dba) : orig(id));
  r = await post(ctx.app);
  assert.equal(r.status, 502);
  ctx.store.writeSync = realWrite;

  const res = await request(ctx.app).get('/resume.pdf');
  assert.equal(res.status, 200);
  assert.equal(res.headers.etag, etag);
});

test('two concurrent POSTs render once', async () => {
  const renders = { n: 0 };
  // A slow render keeps the first update in flight while the second arrives.
  const render = async r => { renders.n += 1; await new Promise(res => setTimeout(res, 150)); return renderPdf(r); };
  const ctx = setup({ render });
  const [a, b] = await Promise.all([post(ctx.app), post(ctx.app)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(b.body, a.body);
  assert.equal(renders.n, 1);
  assert.equal(queries(ctx.notion), 4);
});

test('If-None-Match answers 304; HEAD answers 200 with no body', async () => {
  const { app } = setup();
  await post(app);
  const { headers } = await request(app).get('/resume.pdf');
  const cond = await request(app).get('/resume.pdf').set('If-None-Match', headers.etag);
  assert.equal(cond.status, 304);
  const head = await request(app).head('/resume.pdf');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-type'], 'application/pdf');
  assert.equal(head.text ?? '', '');
});

test('a GET before any render answers 503 with no max-age in either cache header', async () => {
  const { app } = setup();
  const res = await request(app).get('/resume.pdf');
  assert.equal(res.status, 503);
  assert.match(res.headers['content-type'], /^text\/plain/);
  assert.equal(res.text, 'resume not generated yet');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['netlify-cdn-cache-control'], 'no-store');
  assert.doesNotMatch(`${res.headers['cache-control']}${res.headers['netlify-cdn-cache-control']}`, /max-age/);
});

test('limits: /resume.pdf has none; 11 token-less POSTs hit 429; /api is not limited by it', async () => {
  const ctx = setup();
  await post(ctx.app);
  for (let i = 0; i < 400; i += 1) {
    const res = await request(ctx.app).get('/resume.pdf').set('X-Forwarded-For', '203.0.113.9');
    assert.equal(res.status, 200, `request ${i}`);
  }
  const fresh = setup();
  const statuses = [];
  for (let i = 0; i < 11; i += 1) {
    statuses.push((await request(fresh.app).post('/update-resume').set('X-Forwarded-For', '203.0.113.7')).status);
  }
  assert.deepEqual(statuses, [...Array(10).fill(401), 429]);
  assert.equal(fresh.renders.n, 0);

  // Same IP: exhaust the update limiter first, then /api must still answer.
  const ip = '203.0.113.5';
  const api = setup();
  let last;
  for (let i = 0; i < 11; i += 1) last = await request(api.app).post('/update-resume').set('X-Forwarded-For', ip);
  assert.equal(last.status, 429);
  for (let i = 0; i < 11; i += 1) {
    assert.equal((await request(api.app).get('/api/database/db1').set('X-Forwarded-For', ip)).status, 200);
  }
});

test('crash recovery: a PDF with no meta is served by its hash and re-rendered at warmup', async () => {
  const dir = tmpDir();
  const bytes = Buffer.from('%PDF-1.3 leftover');
  fs.writeFileSync(path.join(dir, 'resume.pdf'), bytes);
  const ctx = setup({ dir });
  assert.equal(ctx.service.snapshot().etag, sha(bytes));
  const out = await ctx.service.warmup({ delays: [0, 0, 0] });
  assert.equal(out.updated, true);
  assert.equal(ctx.renders.n, 1);
});

/** Counts update() attempts and makes the first `failures` of them reject. */
function spyUpdate(service, failures = 0, error = new Error('notion down')) {
  const real = service.update.bind(service);
  const spy = { n: 0 };
  service.update = () => {
    spy.n += 1;
    return spy.n <= failures ? Promise.reject(error) : real();
  };
  return spy;
}

test('warmup: no PDF and a failing Notion gives exactly 4 attempts, then stops', async () => {
  const ctx = setup({ notion: fakeNotion({ rows: rowsFor(), fail: new Error('down') }) });
  const spy = spyUpdate(ctx.service, Infinity);
  assert.equal(await ctx.service.warmup({ delays: [0, 0, 0] }), null);
  assert.equal(spy.n, 4);
});

test('warmup: a success on the 2nd attempt stops the retries', async () => {
  const ctx = setup();
  const spy = spyUpdate(ctx.service, 1);
  const out = await ctx.service.warmup({ delays: [0, 0, 0] });
  assert.equal(out.updated, true);
  assert.equal(spy.n, 2);
});

test('warmup: a PDF present with matching meta makes one attempt that is a no-op', async () => {
  const first = setup();
  await first.service.update();
  const second = setup({ dir: first.dir });
  const spy = spyUpdate(second.service, 0);
  const out = await second.service.warmup({ delays: [0, 0, 0] });
  assert.equal(out.updated, false);
  assert.equal(spy.n, 1);
  assert.equal(second.renders.n, 0);
});

test('warmup: with a PDF present a failure is not retried', async () => {
  const first = setup();
  await first.service.update();
  const second = setup({ dir: first.dir });
  const spy = spyUpdate(second.service, Infinity);
  await second.service.warmup({ delays: [0, 0, 0] });
  assert.equal(spy.n, 1);
});

test('warmup: a template change (v1 on disk, v2 running) renders', async () => {
  const v1 = setup({ version: 'v1' });
  await v1.service.update();
  const v2 = setup({ dir: v1.dir, version: 'v2' });
  assert.equal((await v2.service.warmup({ delays: [0] })).updated, true);
  assert.equal(v2.renders.n, 1);
});

test('warmup: not_configured makes one attempt and no retries', async () => {
  const ctx = setup({ dbIds: { ...dbIds, about: '' } });
  const spy = spyUpdate(ctx.service, 0);
  assert.equal(await ctx.service.warmup({ delays: [0, 0, 0] }), null);
  assert.equal(spy.n, 1);
});

test('resilience: a missing dir and a store whose readSync throws still construct, and /api answers', async () => {
  const missing = setup({ dir: path.join(tmpDir(), 'nope') });
  assert.equal(missing.service.snapshot(), null);
  assert.equal((await request(missing.app).get('/api/database/db1')).status, 200);

  const broken = setup({
    store: {
      cleanupTempSync() { throw new Error('EACCES'); },
      readSync() { throw new Error('EACCES'); },
      writeSync() {},
    },
  });
  assert.equal(broken.service.snapshot(), null);
  assert.equal((await request(broken.app).get('/api/database/db1')).status, 200);
});

test('an empty dataset or an About row with no Bio answers 502 and the old PDF stays', async () => {
  const ctx = setup();
  await post(ctx.app);
  const etag = (await request(ctx.app).get('/resume.pdf')).headers.etag;
  const orig = ctx.notion.queryDatabase;
  const override = (id, rows) => { ctx.notion.queryDatabase = i => (i === id ? Promise.resolve(rows) : orig(i)); };

  for (const id of Object.values(dbIds)) {
    override(id, []);
    const r = await post(ctx.app);
    assert.equal(r.status, 502, id);
    assert.deepEqual(r.body, { error: 'upstream_unavailable' });
  }
  override('dba', [{ properties: { Bio: { rich_text: rt('   ') } } }]);
  assert.equal((await post(ctx.app)).status, 502);
  override('dba', [{ id: 'no-properties' }]);
  assert.equal((await post(ctx.app)).status, 502);

  assert.equal((await request(ctx.app).get('/resume.pdf')).headers.etag, etag);
  assert.equal(ctx.renders.n, 1);
});

test('meta written for other bytes loads with hash null, so unchanged content re-renders', async () => {
  const first = setup();
  await first.service.update();
  const meta = JSON.parse(fs.readFileSync(path.join(first.dir, 'resume.json'), 'utf8'));
  assert.equal(meta.etag, first.service.snapshot().etag);
  fs.writeFileSync(path.join(first.dir, 'resume.json'), JSON.stringify({ ...meta, etag: 'f'.repeat(64) }));

  const second = setup({ dir: first.dir });
  assert.equal(second.service.snapshot().hash, null);
  assert.equal((await post(second.app)).body.updated, true);
  assert.equal(second.renders.n, 1);
});

test('the update route logs a sanitised run id', async () => {
  const { app } = setup();
  await post(app, { ...AUTH, 'X-PLR-Run-Id': `run-1.a<b>/;script>${'x'.repeat(100)}` });
  const line = console.log.mock.calls.map(c => c.arguments.join(' ')).find(l => l.includes('update-resume run'));
  assert.match(line, / run-1\.abscriptx{45}$/);
});
