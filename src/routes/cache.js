const crypto = require('node:crypto');
const express = require('express');
const { badRequest } = require('../errors');

const sha256 = s => crypto.createHash('sha256').update(s).digest();

/** Compare fixed-size digests so neither timing nor length leaks the secret. */
const secretMatches = (secret, given = '') => crypto.timingSafeEqual(sha256(secret), sha256(given));

module.exports = ({ cache }) => {
  const router = express.Router();

  router.post('/invalidate', (req, res, next) => {
    // Fail closed: with no secret configured, `undefined !== undefined` would
    // otherwise let a header-less request through.
    const secret = process.env.INVALIDATE_SECRET;
    if (!secret || !secretMatches(secret, req.get('x-invalidate-secret')))
      return res.status(401).json({ error: 'Unauthorized' });
    const { key } = req.query;
    // `?key=` (or blank) must not fall through to clear(): an empty key is a client mistake.
    if (key !== undefined && (typeof key !== 'string' || key.trim() === '')) return next(badRequest());
    if (key !== undefined) { cache.invalidate(key); return res.json({ invalidated: key }); }
    cache.clear();
    res.json({ cleared: true });
  });

  return router;
};
