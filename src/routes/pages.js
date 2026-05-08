const router = require('express').Router();
const cache = require('../cache');
const { getPage, getPageBlocks } = require('../notion');
const TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 300;

router.get('/:pageId', async (req, res) => {
  const cacheKey = `page:${req.params.pageId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  try {
    const data = await getPage(req.params.pageId);
    cache.set(cacheKey, data, TTL);
    res.json({ ...data, _cached: false });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/:pageId/blocks', async (req, res) => {
  const cacheKey = `blocks:${req.params.pageId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ results: cached, _cached: true });
  try {
    const blocks = await getPageBlocks(req.params.pageId);
    cache.set(cacheKey, blocks, TTL);
    res.json({ results: blocks, _cached: false });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
