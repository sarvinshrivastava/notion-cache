/** Notion ids come dashed or not, any case; compare them in one form. */
const normId = s => String(s).trim().toLowerCase().replace(/-/g, '');

/**
 * Comma-separated database ids. The deploy strips the `NOTION_CACHE_` prefix
 * from secrets-manager keys, but either name is accepted. `||`, not `??`, so an
 * empty stripped name still falls through to the prefixed one.
 */
function parseAllowedDbIds(env = process.env) {
  const raw = env.ALLOWED_DB_IDS || env.NOTION_CACHE_ALLOWED_DB_IDS || '';
  return raw.split(',').map(normId).filter(Boolean);
}

module.exports = { normId, parseAllowedDbIds };
