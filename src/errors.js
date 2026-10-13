/** A client-input error. Only errors tagged this way (or body-parser's) map to 400. */
const badRequest = () => Object.assign(new Error('bad_request'), { code: 'bad_request' });

/**
 * Last middleware. Anything that is not a tagged client error is an upstream
 * failure, including Notion's own 401/404/429, which describe our integration,
 * not the caller's request, so they are reported as a generic 502.
 */
function errorHandler(err, req, res, _next) {
  if (err.code === 'bad_request' || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request' });
  }
  console.error('[notion-cache]', req.method, req.originalUrl, err);
  res.status(502).json({ error: 'upstream_unavailable' });
}

module.exports = { badRequest, errorHandler };
