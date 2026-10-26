const crypto = require('node:crypto');

const sha256 = s => crypto.createHash('sha256').update(s).digest();

/** Compare fixed-size digests so neither timing nor length leaks the secret. */
const secretMatches = (secret, given = '') => crypto.timingSafeEqual(sha256(secret), sha256(given));

/** The token of an `Authorization: Bearer <token>` header, or '' when there is none. */
function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  return m ? m[1].trim() : '';
}

module.exports = { secretMatches, bearerToken };
