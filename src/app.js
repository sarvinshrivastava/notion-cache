const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

/**
 * Builds the app from injected dependencies so tests can create a fresh
 * instance (own cache, fake Notion) per case. index.js wires the real ones.
 */
function createApp({ cache, notion, ttl }) {
  const app = express();
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
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
  app.use('/api/pages', require('./routes/pages')({ cache, notion, ttl }));
  app.use('/api/database', require('./routes/database')({ cache, notion, ttl }));

  app.post('/api/cache/invalidate', (req, res) => {
    if (req.headers['x-invalidate-secret'] !== process.env.INVALIDATE_SECRET)
      return res.status(401).json({ error: 'Unauthorized' });
    const { key } = req.query;
    if (key) { cache.invalidate(key); return res.json({ invalidated: key }); }
    cache.cleanup();
    res.json({ message: 'Cache cleaned' });
  });

  app.get('/health', (req, res) => res.json({
    status: 'ok',
    uptime: process.uptime(),
    cache: cache.stats(),
    timestamp: new Date().toISOString(),
  }));

  return app;
}

module.exports = { createApp };
