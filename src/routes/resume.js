const express = require('express');
const rateLimit = require('express-rate-limit');
const { secretMatches, bearerToken } = require('../auth');

module.exports = ({ service, token }) => {
  const router = express.Router();
  // On this route only: /resume.pdf must stay open to Netlify's shared egress.
  const updateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });

  router.post('/update-resume', updateLimiter, async (req, res) => {
    if (!token) return res.status(503).json({ error: 'not_configured' });
    if (!secretMatches(token, bearerToken(req))) return res.status(401).json({ error: 'unauthorized' });
    const runId = req.get('x-plr-run-id');
    if (runId) console.log('[notion-cache] update-resume run', runId);
    try {
      res.json(await service.update());
    } catch (err) {
      if (err.code === 'not_configured') return res.status(503).json({ error: 'not_configured' });
      // Mapped here, not through errorHandler, which would turn Notion's
      // validation_error into a 400.
      console.error('[notion-cache] update-resume failed', err);
      res.status(502).json({ error: 'upstream_unavailable' });
    }
  });

  // Express serves HEAD through this handler too.
  router.get('/resume.pdf', (req, res) => {
    const snap = service.snapshot();
    if (!snap) {
      res.set({ 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' });
      return res.status(503).type('text/plain').send('resume not generated yet');
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Sarvin-Shrivastava-Resume.pdf"',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=300, stale-while-revalidate=86400',
      ETag: `"${snap.etag}"`,
    });
    // send() answers 304 itself when If-None-Match matches (req.fresh).
    res.send(snap.pdf);
  });

  return router;
};
