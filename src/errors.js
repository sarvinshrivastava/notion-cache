/** A client-input error; tagged errors (and the framework ones in errorHandler) map to 400. */
const badRequest = () => Object.assign(new Error('bad_request'), { code: 'bad_request' });

/**
 * Last middleware. 400 for client errors: our tagged ones, body-parser's
 * exposed 4xx http-errors (413/415/parse failure), Express's URIError for a
 * malformed path encoding, and Notion's validation_error (it rejected the
 * request itself). Everything else is an upstream failure, including Notion's
 * 401/404/429, which describe our integration, not the caller's request, so
 * they are reported as a generic 502.
 */
function errorHandler(err, req, res, _next) {
  const clientError = err.code === 'bad_request'
    || err.code === 'validation_error'
    || err instanceof URIError
    || (err.expose && err.status >= 400 && err.status < 500);
  if (clientError) {
    return res.status(400).json({ error: 'bad_request' });
  }
  console.error('[notion-cache]', req.method, req.originalUrl, err);
  res.status(502).json({ error: 'upstream_unavailable' });
}

module.exports = { badRequest, errorHandler };
