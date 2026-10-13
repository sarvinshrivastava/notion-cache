const express = require('express');

module.exports = ({ getOrFetch, notion, ttl }) => {
  const router = express.Router();

  router.get('/:pageId', async (req, res, next) => {
    try {
      const { value, cached, stale } = await getOrFetch(`page:${req.params.pageId}`, ttl, () =>
        notion.getPage(req.params.pageId));
      res.json({ ...value, _cached: cached, ...(stale && { _stale: true }) });
    } catch (err) { next(err); }
  });

  router.get('/:pageId/blocks', async (req, res, next) => {
    try {
      const { value, cached, stale } = await getOrFetch(`blocks:${req.params.pageId}`, ttl, () =>
        notion.getPageBlocks(req.params.pageId));
      res.json({ results: value, _cached: cached, ...(stale && { _stale: true }) });
    } catch (err) { next(err); }
  });

  return router;
};
