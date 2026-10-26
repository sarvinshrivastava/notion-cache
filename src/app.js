const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createCachedFetcher } = require('./services/cached');
const { errorHandler } = require('./errors');

/**
 * Builds the app from injected dependencies so tests can create a fresh
 * instance (own cache, fake Notion) per case. index.js wires the real ones.
 */
function createApp({
  cache, notion, ttl, allowedDbIds = [], resume,
}) {
  const allowlistOn = allowedDbIds.length > 0;
  if (!allowlistOn) {
    // Fail open on purpose: a missing secret must not take the site down.
    console.warn('ALLOWED_DB_IDS is not set — every database id is served');
  }
  const app = express();
  app.disable('x-powered-by');
  // One hop: host nginx proxies to 127.0.0.1 and sets X-Forwarded-For. Without
  // this every visitor shares nginx's address, and so one rate-limit bucket.
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(cors({
    origin: [
      'https://sarvinshrivastava.space',
      'https://www.sarvinshrivastava.space',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
  }));
  // 400, not 100: the site loads its 4 datasets as one group (4 calls per page load).
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 400 }));
  const getOrFetch = createCachedFetcher(cache);
  if (allowlistOn) {
    // Nothing reads pages (0 requests in the access logs), so with the
    // allowlist on, every page route is closed.
    app.use('/api/pages', (req, res) => res.status(404).json({ error: 'not_found' }));
  } else {
    app.use('/api/pages', require('./routes/pages')({ getOrFetch, notion, ttl }));
  }
  app.use('/api/database', require('./routes/database')({ getOrFetch, notion, ttl, allowedDbIds }));

  app.use('/api/cache', require('./routes/cache')({ cache }));
  if (resume) app.use(require('./routes/resume')(resume));

  app.get('/health', (req, res) => res.json({
    status: 'ok',
    allowlist: allowlistOn,
    uptime: process.uptime(),
    // Size only: the keys are database ids and visitor-supplied filters.
    cache: { size: cache.stats().size },
    timestamp: new Date().toISOString(),
  }));

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
