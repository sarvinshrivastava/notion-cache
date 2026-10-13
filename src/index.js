require('dotenv').config();
const { createApp } = require('./app');
const { Cache } = require('./cache');
const notion = require('./notion');

const PORT = process.env.PORT || 3000;
const TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 300;

const cache = new Cache();
const app = createApp({ cache, notion, ttl: TTL });

setInterval(() => cache.cleanup(), 10 * 60 * 1000);
app.listen(PORT, () => console.log(`Notion cache running on port ${PORT}`));
