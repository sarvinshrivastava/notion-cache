const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Write a file through a unique temp name, fsync it, then rename it into place. */
function atomicWrite(dir, name, data) {
  const tmp = path.join(dir, `${name}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, path.join(dir, name));
  } catch (err) {
    // A full volume must not pile up partial temps.
    try {
      fs.rmSync(tmp, { force: true });
    } catch { /* keep the original error */ }
    throw err;
  }
}

// Only the temps atomicWrite creates; anything else in the directory is not ours.
const OWN_TEMP = /^resume\.(pdf|json)\.\d+\.[0-9a-f-]{36}\.tmp$/;

/** The rendered PDF and its `{hash, renderedAt, etag}` on a directory (a volume in Docker). */
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
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) return null;
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'resume.json'), 'utf8'));
      } catch {
        meta = null;
      }
      return { pdf, meta };
    },

    // PDF first, meta second. The meta carries the PDF's sha256 as `etag`, so a
    // crash between the two leaves meta that does not match the bytes on disk,
    // and the service re-renders instead of trusting its hash.
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
      for (const n of names) if (OWN_TEMP.test(n)) fs.rmSync(path.join(dir, n), { force: true });
    },
  };
}

module.exports = { createStore };
