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
