const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

/** Pure: the version of a template is the hash of its files plus the lockfile. */
const computeVersion = ({ files, lockfile }) => sha256(`${files.join('\n')}\n${lockfile}`);

// A file that does not exist yet reads as empty, so the module loads at every step.
const read = file => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
};

/**
 * Derived, never bumped by hand: any template edit or dependency change
 * (transitive @react-pdf/*, pdfkit, fontkit included) re-renders once. The
 * lockfile is hashed because pdfkit's `exports` map hides its package.json.
 */
const TEMPLATE_VERSION = computeVersion({
  files: ['document.js', 'icons.js', 'render.js', 'model.js'].map(f => read(path.join(__dirname, f))),
  lockfile: read(path.resolve(__dirname, '..', '..', 'package-lock.json')),
});

/** The same resume under the same template always hashes the same. */
const contentHash = (resume, version = TEMPLATE_VERSION) => sha256(`${version}\n${JSON.stringify(resume)}`);

module.exports = { computeVersion, contentHash, TEMPLATE_VERSION };
