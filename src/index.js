require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cache = require('./cache');
const app = express();
const PORT = process.env.PORT || 3000;

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
app.use('/api/pages', require('./routes/pages'));
app.use('/api/database', require('./routes/database'));

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

setInterval(() => cache.cleanup(), 10 * 60 * 1000);
app.listen(PORT, () => console.log(`Notion cache running on port ${PORT}`));
