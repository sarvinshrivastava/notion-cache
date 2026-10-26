const path = require('node:path');

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

/**
 * Seconds a cached entry stays fresh. 0 is valid (always refetch; the copy is
 * still kept as a stale fallback); unset, empty, negative or non-numeric falls
 * back to 300. (`parseInt(x) || 300` used to turn 0 into 300.)
 */
function parseTtl(env = process.env) {
  const raw = env.CACHE_TTL_SECONDS;
  const n = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

/**
 * Resume settings. Both names are accepted for each key, with `||` so an empty
 * stripped name falls through to the prefixed one. `dir` is <repo>/data, which
 * is /app/data in the image.
 */
function parseResumeConfig(env = process.env) {
  const pick = name => env[name] || env[`NOTION_CACHE_${name}`] || '';
  return {
    token: pick('RESUME_UPDATE_TOKEN'),
    dbIds: {
      about: normId(pick('RESUME_DB_ABOUT')),
      projects: normId(pick('RESUME_DB_PROJECTS')),
      timeline: normId(pick('RESUME_DB_TIMELINE')),
      experience: normId(pick('RESUME_DB_EXPERIENCE')),
    },
    dir: env.RESUME_DIR || path.resolve(__dirname, '..', 'data'),
  };
}

const optionsFromEnv = (env = process.env) => ({
  ttl: parseTtl(env),
  allowedDbIds: parseAllowedDbIds(env),
});

module.exports = {
  normId, parseAllowedDbIds, parseTtl, parseResumeConfig, optionsFromEnv,
};
