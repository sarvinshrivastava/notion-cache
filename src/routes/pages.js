const express = require('express');

module.exports = ({ cache, notion, ttl }) => {
  const router = express.Router();

  router.get('/:pageId', async (req, res) => {
    const cacheKey = `page:${req.params.pageId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true });
    try {
      const data = await notion.getPage(req.params.pageId);
      cache.set(cacheKey, data, ttl);
      res.json({ ...data, _cached: false });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  });

  router.get('/:pageId/blocks', async (req, res) => {
    const cacheKey = `blocks:${req.params.pageId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ results: cached, _cached: true });
    try {
      const blocks = await notion.getPageBlocks(req.params.pageId);
      cache.set(cacheKey, blocks, ttl);
      res.json({ results: blocks, _cached: false });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  });

  return router;
};
