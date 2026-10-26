const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Write a file through a unique temp name, fsync it, then rename it into place. */
function atomicWrite(dir, name, data) {
  const tmp = path.join(dir, `${name}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, path.join(dir, name));
}

/** The rendered PDF and its `{hash, renderedAt}` on a directory (a volume in Docker). */
function createStore(dir) {
  return {
    readSync() {
      let pdf;
      try {
        pdf = fs.readFileSync(path.join(dir, 'resume.pdf'));
      } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
        throw err;
      }
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'resume.json'), 'utf8'));
      } catch {
        meta = null;
      }
      return { pdf, meta };
    },

    // PDF first, meta second: a crash between them leaves a hash mismatch, so
    // the next run re-renders.
    writeSync(pdf, meta) {
      fs.mkdirSync(dir, { recursive: true });
      atomicWrite(dir, 'resume.pdf', pdf);
      atomicWrite(dir, 'resume.json', JSON.stringify(meta));
    },

    /** Startup only: the starting container is the single writer. */
    cleanupTempSync() {
      let names;
      try {
        names = fs.readdirSync(dir);
      } catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
      }
      for (const n of names) if (n.endsWith('.tmp')) fs.rmSync(path.join(dir, n), { force: true });
    },
  };
}

module.exports = { createStore };
