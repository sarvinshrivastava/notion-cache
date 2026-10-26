/**
 * Raw Notion pages -> the plain shapes buildResume reads. Ported from the
 * portfolio's notionParse (same property names, same sort rules).
 */

const richText = blocks => (Array.isArray(blocks) ? blocks.map(b => b?.plain_text ?? '').join('') : '');

/** Notion URLs become PDF link annotations; only plain http(s) passes. */
function safeUrl(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

const props = page => page?.properties ?? {};
const multi = p => (Array.isArray(p?.multi_select) ? p.multi_select.map(t => t.name) : []);
const num = p => (typeof p?.number === 'number' ? p.number : 0);

function parseAbout(results) {
  const p = props(results[0]);
  return {
    bio: richText(p.Bio?.rich_text),
    email: p.Email?.email || undefined,
    linkedin: safeUrl(p.LinkedIn?.url),
    github: safeUrl(p.GitHub?.url),
    phone: p.Phone?.phone_number || undefined,
  };
}

function parseProjects(results) {
  return results.map(page => {
    const p = props(page);
    return {
      title: richText(p.Name?.title),
      description: richText(p.Description?.rich_text),
      techStack: multi(p['Tech Stack']),
      githubUrl: safeUrl(p['GitHub URL']?.url),
      date: p.Date?.date?.start ?? undefined,
      endDate: p.Date?.date?.end ?? undefined,
      featured: p.Featured?.checkbox ?? false,
      sortOrder: num(p['Sort Order']),
    };
  });
}

function parseTimeline(results) {
  const data = results.map(page => {
    const p = props(page);
    return {
      title: richText(p.Name?.title),
      description: richText(p.Description?.rich_text),
      date: richText(p['Date Range']?.rich_text),
      category: p.Category?.select?.name ?? 'Milestone',
      sortOrder: num(p['Sort Order']),
    };
  });
  // Reverse, then a stable sort by Sort Order ascending: what the site shows.
  return data.reverse().sort((a, b) => a.sortOrder - b.sortOrder);
}

function parseExperience(results) {
  const data = results.map(page => {
    const p = props(page);
    return {
      company: richText(p.Name?.title),
      role: richText(p.Role?.rich_text),
      startDate: p['Start Date']?.date?.start ?? '',
      endDate: p['End Date']?.date?.start ?? undefined,
      description: richText(p.Description?.rich_text),
      sortOrder: num(p['Sort Order']),
    };
  });
  return data.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function parseResumeInput({ about = [], projects = [], timeline = [], experience = [] } = {}) {
  return {
    about: parseAbout(about),
    projects: parseProjects(projects),
    timeline: parseTimeline(timeline),
    experience: parseExperience(experience),
  };
}

module.exports = { parseResumeInput, safeUrl, richText };
