const crypto = require('node:crypto');
const { parseResumeInput } = require('./parse');
const { buildResume } = require('./model');
const { contentHash, TEMPLATE_VERSION } = require('./version');
const { renderPdf } = require('./render');

const sha256hex = data => crypto.createHash('sha256').update(data).digest('hex');
const notConfigured = () => Object.assign(new Error('not_configured'), { code: 'not_configured' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms).unref());

/**
 * Renders the resume PDF from four Notion databases and keeps the latest one in
 * memory (and on the store). Everything is loaded synchronously here, before
 * listen, and nothing in the constructor throws: a broken volume must not take
 * /api down.
 */
function createResumeService({
  notion, store, dbIds, render = renderPdf, version = TEMPLATE_VERSION,
}) {
  let mem = null;
  try {
    store.cleanupTempSync();
  } catch (err) {
    console.error('[notion-cache] resume store cleanup failed', err);
  }
  try {
    const loaded = store.readSync();
    if (loaded) {
      mem = {
        pdf: loaded.pdf,
        etag: sha256hex(loaded.pdf),
        hash: loaded.meta?.hash ?? null,
        renderedAt: loaded.meta?.renderedAt ?? null,
      };
    }
  } catch (err) {
    console.error('[notion-cache] resume store read failed', err);
    mem = null;
  }
  const hadPdf = mem !== null;

  let inflight = null;

  async function run() {
    if (Object.values(dbIds).some(id => !id)) throw notConfigured();
    // Straight to Notion, never through the cache: the PDF must be fresh.
    const [about, projects, timeline, experience] = await Promise.all(
      [dbIds.about, dbIds.projects, dbIds.timeline, dbIds.experience].map(id => notion.queryDatabase(id)),
    );
    const resume = buildResume(parseResumeInput({
      about, projects, timeline, experience,
    }));
    const hash = contentHash(resume, version);
    if (hash === mem?.hash) return { updated: false, hash, renderedAt: mem.renderedAt };
    const pdf = await render(resume);
    const renderedAt = new Date().toISOString();
    store.writeSync(pdf, { hash, renderedAt });
    mem = {
      pdf, etag: sha256hex(pdf), hash, renderedAt,
    };
    return { updated: true, hash, renderedAt };
  }

  const svc = {
    update() {
      inflight ??= run().finally(() => { inflight = null; });
      return inflight;
    },

    snapshot: () => mem,

    /**
     * One update() at startup (a template-only deploy re-renders here; unchanged
     * content is a cheap no-op). Retries only when no PDF existed and the error
     * can still go away.
     */
    async warmup({ delays = [60e3, 300e3, 900e3] } = {}) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await svc.update();
        } catch (err) {
          console.error('[notion-cache] resume warmup failed', err.code ?? '', err.message);
          if (hadPdf || err.code === 'not_configured' || attempt >= delays.length) return null;
          await sleep(delays[attempt]);
        }
      }
    },
  };
  return svc;
}

module.exports = { createResumeService };
