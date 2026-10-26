const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/resume/store');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'resume-store-'));

test('a write then a read round-trips', () => {
  const dir = tmpDir();
  const store = createStore(dir);
  store.writeSync(Buffer.from('%PDF-1'), { hash: 'h', renderedAt: 't' });
  const got = store.readSync();
  assert.equal(got.pdf.toString(), '%PDF-1');
  assert.deepEqual(got.meta, { hash: 'h', renderedAt: 't' });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['resume.json', 'resume.pdf']);
});

test('bad or missing meta gives meta:null and still returns the PDF', () => {
  const dir = tmpDir();
  const store = createStore(dir);
  fs.writeFileSync(path.join(dir, 'resume.pdf'), '%PDF-pdf');
  assert.deepEqual({ ...store.readSync(), pdf: undefined }, { pdf: undefined, meta: null });
  fs.writeFileSync(path.join(dir, 'resume.json'), '{not json');
  const got = store.readSync();
  assert.equal(got.meta, null);
  assert.equal(got.pdf.toString(), '%PDF-pdf');
});

test('cleanupTempSync deletes only the temps this store creates', () => {
  const dir = tmpDir();
  const store = createStore(dir);
  store.writeSync(Buffer.from('%PDF-p'), { hash: 'h' });
  const id = '0123abcd-0123-4abc-8abc-0123456789ab';
  fs.writeFileSync(path.join(dir, `resume.pdf.1.${id}.tmp`), 'x');
  fs.writeFileSync(path.join(dir, `resume.json.22.${id}.tmp`), 'x');
  fs.writeFileSync(path.join(dir, 'other.tmp'), 'x');
  store.cleanupTempSync();
  assert.deepEqual(fs.readdirSync(dir).sort(), ['other.tmp', 'resume.json', 'resume.pdf']);
});

test('a read of a missing dir gives null, and cleanup tolerates it', () => {
  const store = createStore(path.join(tmpDir(), 'nope'));
  assert.equal(store.readSync(), null);
  assert.doesNotThrow(() => store.cleanupTempSync());
});

test('a garbage resume.pdf loads as no PDF', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'resume.pdf'), 'not a pdf');
  assert.equal(createStore(dir).readSync(), null);
});

test('a failed write removes its temp file and rethrows', () => {
  const dir = tmpDir();
  // A non-empty directory at the target name makes the rename fail.
  fs.mkdirSync(path.join(dir, 'resume.pdf'));
  fs.writeFileSync(path.join(dir, 'resume.pdf', 'keep'), 'x');
  assert.throws(() => createStore(dir).writeSync(Buffer.from('%PDF-1'), { hash: 'h' }));
  assert.deepEqual(fs.readdirSync(dir).filter(n => n.endsWith('.tmp')), []);
});
