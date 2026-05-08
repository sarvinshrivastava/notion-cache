const router = require('express').Router();
const cache = require('../cache');
const { queryDatabase } = require('../notion');
const TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 300;

router.get('/:dbId', async (req, res) => {
  const cacheKey = `db:${req.params.dbId}:${JSON.stringify(req.query)}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, _cached: true });
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const sorts = req.query.sorts ? JSON.parse(req.query.sorts) : [];
    const results = await queryDatabase(req.params.dbId, filter, sorts);
    cache.set(cacheKey, results, TTL);
    res.json({ results, _cached: false });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
