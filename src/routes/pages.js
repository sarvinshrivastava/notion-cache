const express = require('express');
const { cacheMeta } = require('../services/cached');

module.exports = ({ getOrFetch, notion, ttl }) => {
  const router = express.Router();

  router.get('/:pageId', async (req, res, next) => {
    try {
      const hit = await getOrFetch(`page:${req.params.pageId}`, ttl, () => notion.getPage(req.params.pageId));
      res.json({ ...hit.value, ...cacheMeta(hit) });
    } catch (err) { next(err); }
  });

  router.get('/:pageId/blocks', async (req, res, next) => {
    try {
      const hit = await getOrFetch(`blocks:${req.params.pageId}`, ttl, () => notion.getPageBlocks(req.params.pageId));
      res.json({ results: hit.value, ...cacheMeta(hit) });
    } catch (err) { next(err); }
  });

  return router;
};
