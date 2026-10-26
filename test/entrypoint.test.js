const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const entry = path.resolve(__dirname, '..', 'src', 'index.js');

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

/** Resolves when the child logs that it is listening; rejects on exit or after 15 s. */
const listening = (child, log) => new Promise((resolve, reject) => {
  let out = '';
  const timer = setTimeout(() => reject(new Error(`no listen in 15 s:\n${out}`)), 15000);
  const onData = d => {
    out += d;
    log.text = out;
    if (out.includes('Notion cache running on port')) { clearTimeout(timer); resolve(); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', d => { out += d; log.text = out; });
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`exited ${code}:\n${out}`)); });
});

test('index.js wires the resume router: 503/401/503 on the resume routes, /health 200', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-entry-cwd-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-entry-data-'));
  const port = await freePort();
  // A minimal env, so nothing from the developer's shell leaks in; cwd is a
  // temp dir so dotenv finds no file to load.
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: String(port),
      NOTION_TOKEN: 'fake',
      RESUME_DIR: dir,
      RESUME_UPDATE_TOKEN: 'tok',
    },
  });
  const log = { text: '' };
  try {
    await listening(child, log);
    const url = p => `http://127.0.0.1:${port}${p}`;

    const pdf = await fetch(url('/resume.pdf'));
    assert.equal(pdf.status, 503);
    assert.equal(pdf.headers.get('cache-control'), 'no-store');

    const noAuth = await fetch(url('/update-resume'), { method: 'POST' });
    assert.equal(noAuth.status, 401);

    const authed = await fetch(url('/update-resume'), { method: 'POST', headers: { Authorization: 'Bearer tok' } });
    assert.equal(authed.status, 503);
    assert.deepEqual(await authed.json(), { error: 'not_configured' });

    assert.equal((await fetch(url('/health'))).status, 200);

    // warmup ran after listen: with no database ids it logs not_configured.
    for (let i = 0; i < 50 && !log.text.includes('resume warmup failed'); i += 1) await new Promise(r => setTimeout(r, 100));
    assert.match(log.text, /resume warmup failed not_configured/);
  } finally {
    child.kill('SIGKILL');
  }
});
