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
  fs.writeFileSync(path.join(dir, 'resume.pdf'), 'pdf');
  assert.deepEqual({ ...store.readSync(), pdf: undefined }, { pdf: undefined, meta: null });
  fs.writeFileSync(path.join(dir, 'resume.json'), '{not json');
  const got = store.readSync();
  assert.equal(got.meta, null);
  assert.equal(got.pdf.toString(), 'pdf');
});

test('cleanupTempSync deletes every .tmp and nothing else', () => {
  const dir = tmpDir();
  const store = createStore(dir);
  store.writeSync(Buffer.from('p'), { hash: 'h' });
  fs.writeFileSync(path.join(dir, 'resume.pdf.1.abc.tmp'), 'x');
  fs.writeFileSync(path.join(dir, 'resume.json.2.def.tmp'), 'x');
  store.cleanupTempSync();
  assert.deepEqual(fs.readdirSync(dir).sort(), ['resume.json', 'resume.pdf']);
});

test('a read of a missing dir gives null, and cleanup tolerates it', () => {
  const store = createStore(path.join(tmpDir(), 'nope'));
  assert.equal(store.readSync(), null);
  assert.doesNotThrow(() => store.cleanupTempSync());
});
