const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderPdf } = require('../src/resume/render');
const { footerText } = require('../src/resume/document');

const pages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const bullets = n => Array.from({ length: n }, (_, i) => `Delivered result number ${i} with measurable impact across the team`);
const contacts = [
  { kind: 'phone', label: '+91 98765 43210', href: 'tel:+919876543210' },
  { kind: 'email', label: 'a@b.co', href: 'mailto:a@b.co' },
  { kind: 'linkedin', label: 'Sarvin Shrivastava', href: 'https://linkedin.com/in/x' },
  { kind: 'github', label: 'sarvinshrivastava', href: 'https://github.com/sarvinshrivastava' },
];
const project = i => ({
  title: `Project ${i}`, stack: 'React, TypeScript, Node, Express', dates: 'July 2025 — September 2025', bullets: bullets(3), repo: `https://github.com/sarvinshrivastava/project-${i}`,
});
const fixture = () => ({
  name: 'Sarvin Shrivastava',
  contacts,
  summary: words(60),
  experience: [0, 1].map(i => ({
    company: `Company ${i}`, role: 'Full Stack Developer', dates: 'October 2025 — Present', bullets: bullets(4),
  })),
  projects: [0, 1, 2, 3].map(project),
  achievements: [0, 1, 2].map(i => ({ title: `Achievement ${i}`, bullets: [] })),
  leadership: [0, 1].map(i => ({ title: `Leadership ${i}`, dates: '2023 — 2024', bullets: [] })),
});

test('renders a PDF between 2 KB and 1 MB', async () => {
  const buf = await renderPdf(fixture());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 2048 && buf.length < 1024 * 1024, `size ${buf.length}`);
});

test('an all-empty input still renders', async () => {
  const buf = await renderPdf({
    name: 'x', contacts: [], experience: [], projects: [], achievements: [], leadership: [],
  });
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
});

test('the live-sized fixture is exactly 1 page; the worst case is at most 2', async () => {
  assert.equal(pages(await renderPdf(fixture())), 1);
  const worst = fixture();
  worst.projects = [0, 1, 2, 3, 4, 5].map(i => ({ ...project(i), bullets: bullets(4) }));
  assert.ok(pages(await renderPdf(worst)) <= 2);
});

test('a render takes under 5 s', async () => {
  const t0 = Date.now();
  await renderPdf(fixture());
  assert.ok(Date.now() - t0 < 5000);
});

test('the footer has no date', () => {
  assert.equal(footerText({ pageNumber: 1, totalPages: 2 }), 'sarvinshrivastava.space · 1/2');
});

// ── What the template puts in the document ─────────────────────────────────
// String stand-ins for the react-pdf components: createDocument then returns a
// plain React element tree that can be read without rendering.
const STAND_INS = Object.fromEntries(
  ['Document', 'Page', 'View', 'Text', 'Link', 'Svg', 'Path', 'Rect', 'Circle'].map(n => [n, n]),
);
const { createDocument } = require('../src/resume/document');

const kids = el => [el.props.children].flat(Infinity).filter(c => c !== undefined && c !== null && c !== false);
const textOf = el => (typeof el === 'object' ? kids(el).map(textOf).join('') : String(el));
function walk(el, visit) {
  if (typeof el !== 'object') return;
  visit(el);
  kids(el).forEach(c => walk(c, visit));
}
const collect = (el, pred) => {
  const out = [];
  walk(el, e => { if (pred(e)) out.push(e); });
  return out;
};

const content = model => {
  const tree = createDocument(STAND_INS, model);
  const links = collect(tree, e => e.type === 'Link').map(e => ({ src: e.props.src, text: textOf(e) }));
  const headings = collect(tree, e => e.type === 'View' && e.props.minPresenceAhead === 40).map(textOf);
  const footer = collect(tree, e => e.type === 'Text' && e.props.fixed)[0];
  return {
    tree, links, headings, footer, text: textOf(tree),
  };
};

test('template: headings in order, contact link targets, repo bullet, footer without a date', () => {
  const c = content(fixture());
  assert.deepEqual(c.headings, ['Summary', 'Experience', 'Projects', 'Achievements', 'Leadership']);
  for (const k of contacts) assert.ok(c.links.some(l => l.src === k.href && l.text === k.label), k.kind);
  const repo = c.links.find(l => l.src === 'https://github.com/sarvinshrivastava/project-0');
  assert.equal(repo.text, 'github.com/sarvinshrivastava/project-0');
  assert.match(c.text, /Repository Link: github\.com\/sarvinshrivastava\/project-0/);
  assert.match(c.text, /Company 0.*Full Stack Developer/s);
  assert.match(c.text, /Project 0 \| React, TypeScript, Node, Express/);
  assert.equal(c.footer.props.render({ pageNumber: 1, totalPages: 1 }), 'sarvinshrivastava.space · 1/1');
  assert.doesNotMatch(c.footer.props.render({ pageNumber: 1, totalPages: 1 }), /\d{4}|Generated/);
});

test('template: an empty section is omitted, and the heading with it', () => {
  const c = content({
    ...fixture(), summary: undefined, achievements: [], leadership: [],
  });
  assert.deepEqual(c.headings, ['Experience', 'Projects']);
  assert.doesNotMatch(c.text, /Achievement 0|Leadership 0|word0/);
  const none = content({
    name: 'x', contacts: [], experience: [], projects: [], achievements: [], leadership: [],
  });
  assert.deepEqual(none.headings, []);
});

test('template: no repo link without a repo, and a role row only when the role is set', () => {
  const m = fixture();
  m.projects = [{ ...project(0), repo: undefined }];
  m.experience = [{
    company: 'Solo', role: '', dates: '', bullets: [],
  }];
  const c = content(m);
  assert.doesNotMatch(c.text, /Repository Link/);
  assert.doesNotMatch(c.text, /Full Stack Developer/);
});
