const { Client } = require('@notionhq/client');

// Without a token every query fails with 401 while /health still says ok, so
// the site goes silently empty. Refuse to start instead.
if (!process.env.NOTION_TOKEN && process.env.NODE_ENV !== 'test') {
  throw new Error('NOTION_TOKEN missing');
}
// 5 s leaves the portfolio's resume function (8 s budget) time to get a stale
// copy back when Notion hangs.
const notion = new Client({ auth: process.env.NOTION_TOKEN, timeoutMs: 5000 });

async function getPage(pageId) {
  return await notion.pages.retrieve({ page_id: pageId });
}

async function getPageBlocks(pageId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function queryDatabase(databaseId, filter = {}, sorts = []) {
  const results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter: Object.keys(filter).length ? filter : undefined,
      sorts: sorts.length ? sorts : undefined,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

module.exports = { getPage, getPageBlocks, queryDatabase };
