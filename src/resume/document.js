const { createElement: h } = require('react');
const { icons } = require('./icons');

const BLACK = '#000';
const stroke = {
  stroke: BLACK, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round',
};

const styles = {
  page: {
    paddingTop: 40, paddingBottom: 40, paddingHorizontal: 42, fontFamily: 'Times-Roman', fontSize: 10.5, color: BLACK,
  },
  name: { fontSize: 24, fontFamily: 'Times-Bold', textAlign: 'center' },
  contacts: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 6,
  },
  contact: { flexDirection: 'row', alignItems: 'center' },
  link: { color: BLACK, textDecoration: 'underline' },
  heading: { marginTop: 8, marginBottom: 4, borderBottomWidth: 0.6, borderBottomColor: BLACK },
  headingText: { fontSize: 12, letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  left: { flex: 1 },
  dates: { flexShrink: 0, marginLeft: 8 },
  bold: { fontFamily: 'Times-Bold' },
  italic: { fontFamily: 'Times-Italic' },
  bullet: { flexDirection: 'row', marginTop: 1 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
  footer: {
    position: 'absolute', bottom: 18, left: 42, right: 42, fontSize: 7, color: '#777', textAlign: 'center',
  },
};

/** The footer line. No date: the PDF does not say when it was made. */
const footerText = ({ pageNumber, totalPages }) => `sarvinshrivastava.space · ${pageNumber}/${totalPages}`;

/** `pdf` is the dynamically imported @react-pdf/renderer module. */
function createDocument(pdf, resume) {
  const {
    Document, Page, View, Text, Link, Svg, Path, Rect, Circle,
  } = pdf;

  const icon = kind => {
    const g = icons[kind === 'email' ? 'mail' : kind];
    return h(
      Svg,
      { viewBox: '0 0 24 24', width: 9, height: 9, style: { marginRight: 3 } },
      ...g.paths.map((d, i) => h(Path, { key: `p${i}`, d, ...stroke })),
      ...(g.rects ?? []).map((r, i) => h(Rect, { key: `r${i}`, ...r, ...stroke })),
      ...(g.circles ?? []).map((c, i) => h(Circle, { key: `c${i}`, ...c, ...stroke })),
    );
  };

  const contact = c => h(
    View,
    { key: c.kind, style: styles.contact },
    icon(c.kind),
    h(Link, { src: c.href, style: styles.link }, c.label),
  );

  const section = (name, children) => (children.length
    ? [
      h(View, { key: `${name}-h`, style: styles.heading, minPresenceAhead: 40 }, h(Text, { style: styles.headingText }, name)),
      ...children,
    ]
    : []);

  const bullet = (key, ...content) => h(
    View,
    { key, style: styles.bullet, wrap: false },
    h(Text, { style: styles.dot }, '•'),
    h(Text, { style: styles.bulletText }, ...content),
  );

  const bullets = (items, key) => items.map((b, i) => bullet(`${key}-${i}`, b));

  const repoBullet = (repo, key) => bullet(
    `${key}-repo`,
    'Repository Link: ',
    h(Link, { src: repo, style: styles.link }, repo.replace(/^https?:\/\//i, '')),
  );

  const entry = (key, left, dates, body) => h(
    View,
    { key },
    h(
      View,
      { style: styles.row, wrap: false, minPresenceAhead: 30 },
      h(Text, { style: styles.left }, ...left),
      dates ? h(Text, { style: styles.dates }, dates) : null,
    ),
    ...body,
  );

  const experience = resume.experience.map((e, i) => entry(
    `exp-${i}`,
    [h(Text, { key: 'c', style: styles.bold }, e.company)],
    e.dates,
    [
      ...(e.role ? [h(Text, { key: 'role', style: styles.italic }, e.role)] : []),
      ...bullets(e.bullets, `exp-${i}`),
    ],
  ));

  const projects = resume.projects.map((p, i) => entry(
    `proj-${i}`,
    [
      h(Text, { key: 't', style: styles.bold }, p.title),
      ...(p.stack ? [' | ', h(Text, { key: 's', style: styles.italic }, p.stack)] : []),
    ],
    p.dates,
    [...bullets(p.bullets, `proj-${i}`), ...(p.repo ? [repoBullet(p.repo, `proj-${i}`)] : [])],
  ));

  const achievements = resume.achievements.map((a, i) => entry(
    `ach-${i}`,
    [h(Text, { key: 't', style: styles.bold }, a.title)],
    '',
    bullets(a.bullets, `ach-${i}`),
  ));

  const leadership = resume.leadership.map((l, i) => entry(
    `lead-${i}`,
    [h(Text, { key: 't', style: styles.bold }, l.title)],
    l.dates,
    bullets(l.bullets, `lead-${i}`),
  ));

  return h(
    Document,
    { title: `${resume.name} Resume`, author: resume.name },
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(Text, { style: styles.name }, resume.name),
      h(View, { style: styles.contacts }, ...resume.contacts.map(contact)),
      ...section('Summary', resume.summary ? [h(Text, { key: 'summary' }, resume.summary)] : []),
      ...section('Experience', experience),
      ...section('Projects', projects),
      ...section('Achievements', achievements),
      ...section('Leadership', leadership),
      h(Text, { style: styles.footer, fixed: true, render: footerText }),
    ),
  );
}

module.exports = { createDocument, footerText };
