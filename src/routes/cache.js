const crypto = require('node:crypto');
const express = require('express');
const { badRequest } = require('../errors');

/** Constant-time compare; a missing header counts as an empty buffer. */
function secretMatches(secret, given = '') {
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = ({ cache }) => {
  const router = express.Router();

  router.post('/invalidate', (req, res, next) => {
    // Fail closed: with no secret configured, `undefined !== undefined` would
    // otherwise let a header-less request through.
    const secret = process.env.INVALIDATE_SECRET;
    if (!secret || !secretMatches(secret, req.get('x-invalidate-secret')))
      return res.status(401).json({ error: 'Unauthorized' });
    const { key } = req.query;
    // `?key=` must not fall through to clear(): an empty key is a client mistake.
    if (key !== undefined && (typeof key !== 'string' || key === '')) return next(badRequest());
    if (key !== undefined) { cache.invalidate(key); return res.json({ invalidated: key }); }
    cache.clear();
    res.json({ cleared: true });
  });

  return router;
};
