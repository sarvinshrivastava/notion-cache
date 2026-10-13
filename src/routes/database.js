const express = require('express');
const { normId } = require('../config');

module.exports = ({ cache, notion, ttl, allowedDbIds = [] }) => {
  const router = express.Router();
  const allowed = new Set(allowedDbIds);

  router.get('/:dbId', async (req, res) => {
    // One form for the allowlist, the Notion call and the cache key, so the
    // dashed and undashed spellings of an id share an entry.
    const dbId = normId(req.params.dbId);
    if (allowed.size && !allowed.has(dbId)) return res.status(404).json({ error: 'not_found' });

    const cacheKey = `db:${dbId}:${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ results: cached, _cached: true });
    try {
      const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
      const sorts = req.query.sorts ? JSON.parse(req.query.sorts) : [];
      const results = await notion.queryDatabase(dbId, filter, sorts);
      cache.set(cacheKey, results, ttl);
      res.json({ results, _cached: false });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  });

  return router;
};
