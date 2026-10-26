const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildResume, toWinAnsi, fullMonthYear, formatRange, lines, PROJECT_FALLBACK_COUNT, PROJECT_MAX,
} = require('../src/resume/model');
const { parseResumeInput } = require('../src/resume/parse');
const { computeVersion, contentHash, TEMPLATE_VERSION } = require('../src/resume/version');

const rt = text => [{ plain_text: text }];
const title = text => ({ title: rt(text) });
const rich = text => ({ rich_text: rt(text) });

const input = (over = {}) => ({
  about: { bio: '', ...over.about },
  projects: over.projects ?? [],
  timeline: over.timeline ?? [],
  experience: over.experience ?? [],
});
const proj = (t, o = {}) => ({ title: t, description: '', techStack: [], featured: false, sortOrder: 0, ...o });

test('contacts: order phone, email, linkedin, github', () => {
  const r = buildResume(input({
    about: {
      phone: '+91 98765 43210', email: 'a@b.co', linkedin: 'https://linkedin.com/in/x', github: 'https://github.com/sarvinshrivastava/',
    },
  }));
  assert.deepEqual(r.contacts.map(c => c.kind), ['phone', 'email', 'linkedin', 'github']);
  assert.equal(r.contacts[0].href, 'tel:+919876543210');
  assert.equal(r.contacts[0].label, '+91 98765 43210');
  assert.equal(r.contacts[1].href, 'mailto:a@b.co');
  assert.equal(r.contacts[2].label, 'Sarvin Shrivastava');
  assert.equal(r.contacts[3].label, 'sarvinshrivastava');
});

test('contacts: a missing or short phone is skipped, fallbacks fill the rest', () => {
  assert.deepEqual(buildResume(input()).contacts.map(c => c.kind), ['email', 'linkedin', 'github']);
  const short = buildResume(input({ about: { phone: '12345' } }));
  assert.equal(short.contacts.some(c => c.kind === 'phone'), false);
});

test('contacts: a GitHub URL with no path has no github contact', () => {
  const r = buildResume(input({ about: { github: 'https://github.com/' } }));
  assert.equal(r.contacts.some(c => c.kind === 'github'), false);
});

test('summary comes from the bio, or is undefined', () => {
  assert.equal(buildResume(input({ about: { bio: '  Hello\nworld ' } })).summary, 'Hello world');
  assert.equal(buildResume(input({ about: { bio: '  ' } })).summary, undefined);
});

test('projects: Featured selection, sorted by Sort Order then title, no team text', () => {
  const r = buildResume(input({
    projects: [
      proj('Zed', { featured: true, sortOrder: 1 }),
      proj('Beta', { featured: true, sortOrder: 2 }),
      proj('Alpha', { featured: true, sortOrder: 2 }),
      proj('Hidden'),
      proj('', { featured: true }),
    ],
  }));
  assert.deepEqual(r.projects.map(p => p.title), ['Zed', 'Alpha', 'Beta']);
  assert.doesNotMatch(JSON.stringify(r), /team|Individual|Group/i);
  assert.equal('team' in r.projects[0], false);
});

test('projects: fallback of 4 with none Featured, cap of 6 with Featured', () => {
  const many = n => Array.from({ length: n }, (_, i) => proj(`P${i}`, { sortOrder: i, featured: false }));
  assert.equal(PROJECT_FALLBACK_COUNT, 4);
  assert.equal(PROJECT_MAX, 6);
  assert.deepEqual(buildResume(input({ projects: many(9) })).projects.map(p => p.title), ['P0', 'P1', 'P2', 'P3']);
  const featured = many(9).map(p => ({ ...p, featured: true }));
  assert.equal(buildResume(input({ projects: featured })).projects.length, 6);
});

test('projects: stack, dates, bullets and repo', () => {
  const [p] = buildResume(input({
    projects: [proj('Site', {
      techStack: ['React', 'Node'], date: '2025-07-03', endDate: '2025-09-01', description: '• one\n\n- two', githubUrl: 'https://github.com/x/y',
    })],
  })).projects;
  assert.deepEqual(p, {
    title: 'Site', stack: 'React, Node', dates: 'July 2025 — September 2025', bullets: ['one', 'two'], repo: 'https://github.com/x/y',
  });
});

test('lines strips bullet glyphs and blanks, but keeps a glyph with no space', () => {
  assert.deepEqual(lines('• a\n▸ b\n* c\n– d\n- e\n\n  \n-f'), ['a', 'b', 'c', 'd', 'e', '-f']);
  assert.deepEqual(lines(''), []);
});

test('ranges: Present, start only, bad date', () => {
  assert.equal(formatRange('2025-10-01', undefined, true), 'October 2025 — Present');
  assert.equal(formatRange('2025-10-01', 'junk', true), 'October 2025');
  assert.equal(formatRange('2025-10-01', '2026-02-10', true), 'October 2025 — February 2026');
  assert.equal(formatRange('2025-07-01', undefined, false), 'July 2025');
  assert.equal(formatRange('nope', undefined, true), '');
  assert.equal(formatRange('', '2025-01-01', true), '');
  assert.equal(fullMonthYear('2025-13-01'), '');
  assert.equal(fullMonthYear(undefined), '');
});

test('toWinAnsi: arrows transliterated, emoji and Devanagari stripped, dashes and quotes kept', () => {
  assert.equal(toWinAnsi('a → b ← c'), 'a -> b <- c');
  assert.equal(toWinAnsi('hi 😀 नमस्ते there'), 'hi   there');
  assert.equal(toWinAnsi('“quote” — it’s – fine • é'), '“quote” — it’s – fine • é');
  assert.equal(toWinAnsi('a\nb\tc'), 'a b c');
  assert.equal(toWinAnsi(undefined), '');
});

test('experience: empty companies dropped, no role row text when empty, open-ended dates', () => {
  const r = buildResume(input({
    experience: [
      {
        company: 'Habuild', role: '', startDate: '2025-10-01', description: '• built\n• shipped',
      },
      { company: ' ', role: 'x', startDate: '2020-01-01', description: '' },
    ],
  }));
  assert.deepEqual(r.experience, [{
    company: 'Habuild', role: '', dates: 'October 2025 — Present', bullets: ['built', 'shipped'],
  }]);
});

test('achievements and leadership are filtered by category and keep order', () => {
  const t = (title, category, date = '') => ({
    title, category, date, description: '- x', sortOrder: 0,
  });
  const r = buildResume(input({
    timeline: [t('A1', 'Achievement'), t('L1', 'Leadership', '2023 — 2024'), t('M', 'Milestone'), t('', 'Achievement'), t('A2', 'Achievement')],
  }));
  assert.deepEqual(r.achievements.map(a => a.title), ['A1', 'A2']);
  assert.deepEqual(r.leadership, [{ title: 'L1', dates: '2023 — 2024', bullets: ['x'] }]);
});

test('parse: missing properties do not throw, and a javascript: URL is dropped', () => {
  const out = parseResumeInput({
    about: [{ id: 'a' }], projects: [{ id: 'p' }], timeline: [{ id: 't' }], experience: [{ id: 'e' }],
  });
  assert.equal(out.about.bio, '');
  assert.equal(out.projects[0].title, '');
  assert.equal(out.experience[0].startDate, '');
  const bad = parseResumeInput({
    about: [{
      properties: {
        GitHub: { url: 'javascript:alert(1)' }, LinkedIn: { url: 'https://x.test/a' }, Phone: { phone_number: '+1 555 123 4567' }, Bio: rich('hi'),
      },
    }],
  });
  assert.equal(bad.about.github, undefined);
  assert.equal(bad.about.linkedin, 'https://x.test/a');
  assert.equal(bad.about.phone, '+1 555 123 4567');
});

test('parse: timeline is reversed then stable-sorted by Sort Order; experience newest first', () => {
  const row = (name, n) => ({ properties: { Name: title(name), 'Sort Order': { number: n } } });
  const out = parseResumeInput({ timeline: [row('a', 1), row('b', 1), row('c', 0)] });
  assert.deepEqual(out.timeline.map(t => t.title), ['c', 'b', 'a']);
  const exp = d => ({ properties: { Name: title(d), 'Start Date': { date: { start: d } } } });
  const e = parseResumeInput({ experience: [exp('2020-01-01'), exp('2025-01-01')] });
  assert.deepEqual(e.experience.map(x => x.company), ['2025-01-01', '2020-01-01']);
});

test('hash changes when a bullet changes, and when the injected version changes', () => {
  const a = buildResume(input({ experience: [{ company: 'H', role: '', startDate: '2025-01-01', description: 'one' }] }));
  const b = buildResume(input({ experience: [{ company: 'H', role: '', startDate: '2025-01-01', description: 'two' }] }));
  assert.notEqual(contentHash(a), contentHash(b));
  assert.equal(contentHash(a), contentHash(a));
  assert.notEqual(contentHash(a, 'v1'), contentHash(a, 'v2'));
});

test('TEMPLATE_VERSION is 64 hex; computeVersion reacts to the lockfile and to each file', () => {
  assert.match(TEMPLATE_VERSION, /^[0-9a-f]{64}$/);
  const base = computeVersion({ files: ['a', 'b'], lockfile: 'L' });
  assert.notEqual(base, computeVersion({ files: ['a', 'b'], lockfile: 'L2' }));
  assert.notEqual(base, computeVersion({ files: ['a', 'c'], lockfile: 'L' }));
  assert.equal(base, computeVersion({ files: ['a', 'b'], lockfile: 'L' }));
});

test('every template file and the lockfile exist and are non-empty', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { TEMPLATE_FILES, LOCKFILE } = require('../src/resume/version');
  assert.ok(TEMPLATE_FILES.length >= 4);
  for (const f of [...TEMPLATE_FILES.map(n => path.join(__dirname, '..', 'src', 'resume', n)), LOCKFILE]) {
    assert.ok(fs.statSync(f).size > 0, f);
  }
});
