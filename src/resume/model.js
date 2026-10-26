const {
  NAME, FALLBACK_EMAIL, FALLBACK_LINKEDIN, FALLBACK_GITHUB, LINKEDIN_LABEL,
} = require('./profile');

const PROJECT_FALLBACK_COUNT = 4;
const PROJECT_MAX = 6;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Standard PDF fonts are WinAnsi: Latin-1 plus these cp1252 extras.
const CP1252_EXTRAS = new Set(
  [...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'].map(c => c.codePointAt(0)),
);
const ARROWS = { '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '↑': '^', '↓': 'v' };

const inWinAnsi = cp => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRAS.has(cp);

/**
 * Text the standard fonts can draw: newlines and tabs become spaces, arrows are
 * transliterated, anything else outside WinAnsi (emoji, Devanagari, zero-width
 * joiners) is stripped. Dashes and quotes are kept.
 */
function toWinAnsi(s) {
  let out = '';
  for (const ch of String(s ?? '').replace(/[\n\r\t]/g, ' ')) {
    if (ARROWS[ch]) out += ARROWS[ch];
    else if (inWinAnsi(ch.codePointAt(0))) out += ch;
  }
  return out;
}

const clean = s => toWinAnsi(s).trim();

/** 'October 2025' from an ISO date by string math, or '' when unusable. */
function fullMonthYear(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(typeof iso === 'string' ? iso : '');
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : '';
}

function formatRange(start, end, openEnded) {
  const s = fullMonthYear(start);
  if (!s) return '';
  if (!end) return openEnded ? `${s} — Present` : s;
  const e = fullMonthYear(end);
  return e ? `${s} — ${e}` : s;
}

/** Split on newlines, strip a leading bullet glyph plus its space, drop empty lines. */
function lines(text) {
  return String(text ?? '')
    .split('\n')
    .map(l => clean(l.trim().replace(/^[•▸▹*–-]\s+/, '')))
    .filter(Boolean);
}

function githubLabel(url) {
  try {
    return new URL(url).pathname.split('/').find(Boolean) ?? '';
  } catch {
    return '';
  }
}

function buildContacts(about) {
  const contacts = [];
  const phone = (about.phone ?? '').trim();
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length >= 7) {
    contacts.push({ kind: 'phone', label: clean(phone), href: `tel:${digits}` });
  }
  const email = (about.email ?? FALLBACK_EMAIL).trim();
  if (email) contacts.push({ kind: 'email', label: clean(email), href: `mailto:${email}` });
  const linkedin = about.linkedin ?? FALLBACK_LINKEDIN;
  if (linkedin) contacts.push({ kind: 'linkedin', label: LINKEDIN_LABEL, href: linkedin });
  const github = about.github ?? FALLBACK_GITHUB;
  const label = github ? clean(githubLabel(github)) : '';
  if (label) contacts.push({ kind: 'github', label, href: github });
  return contacts;
}

function buildProjects(projects) {
  const named = projects.filter(p => clean(p.title));
  const featured = named.filter(p => p.featured);
  const pool = featured.length ? featured : named;
  return [...pool]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .slice(0, featured.length ? PROJECT_MAX : PROJECT_FALLBACK_COUNT)
    .map(p => ({
      title: clean(p.title),
      stack: clean(p.techStack.join(', ')),
      dates: formatRange(p.date, p.endDate, false),
      bullets: lines(p.description),
      repo: p.githubUrl,
    }));
}

/** Pure: the same input always gives the same object. There is no date field. */
function buildResume({ about, projects, timeline, experience }) {
  const summary = clean(about.bio);
  const byCategory = category => timeline.filter(t => t.category === category && clean(t.title));
  return {
    name: NAME,
    contacts: buildContacts(about),
    summary: summary || undefined,
    experience: experience
      .filter(e => clean(e.company))
      .map(e => ({
        company: clean(e.company),
        role: clean(e.role),
        dates: formatRange(e.startDate, e.endDate, true),
        bullets: lines(e.description),
      })),
    projects: buildProjects(projects),
    achievements: byCategory('Achievement').map(t => ({ title: clean(t.title), bullets: lines(t.description) })),
    leadership: byCategory('Leadership').map(t => ({
      title: clean(t.title),
      dates: clean(t.date),
      bullets: lines(t.description),
    })),
  };
}

module.exports = {
  buildResume, toWinAnsi, fullMonthYear, formatRange, lines, PROJECT_FALLBACK_COUNT, PROJECT_MAX,
};
