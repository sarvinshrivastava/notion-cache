const express = require('express');
const { normId } = require('../config');
const { badRequest } = require('../errors');
const { cacheMeta } = require('../services/cached');

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** An optional JSON query param; anything malformed is a 400, not a Notion call. */
function jsonParam(raw, isValid, fallback) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') throw badRequest();
  let value;
  try { value = JSON.parse(raw); } catch { throw badRequest(); }
  if (!isValid(value)) throw badRequest();
  return value;
}

module.exports = ({ getOrFetch, notion, ttl, allowedDbIds = [] }) => {
  const router = express.Router();
  const allowed = new Set(allowedDbIds);

  router.get('/:dbId', async (req, res, next) => {
    // One form for the allowlist, the Notion call and the cache key, so the
    // dashed and undashed spellings of an id share an entry.
    const dbId = normId(req.params.dbId);
    if (allowed.size && !allowed.has(dbId)) return res.status(404).json({ error: 'not_found' });

    try {
      const filter = jsonParam(req.query.filter, isPlainObject, {});
      const sorts = jsonParam(req.query.sorts, Array.isArray, []);
      // Keyed on the parsed values only: unknown query params (?x=1, ?x=2)
      // must not create new entries or new Notion queries.
      const cacheKey = `db:${dbId}:${JSON.stringify({ filter, sorts })}`;
      const hit = await getOrFetch(cacheKey, ttl, () => notion.queryDatabase(dbId, filter, sorts));
      res.json({ results: hit.value, ...cacheMeta(hit) });
    } catch (err) { next(err); }
  });

  return router;
};
