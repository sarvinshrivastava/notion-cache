const { createApp } = require('../src/app');
const { Cache } = require('../src/cache');

/**
 * A stand-in for src/notion.js. `rows` maps a database id to its rows; `fail`
 * makes every call reject with that error. `calls` counts queries per id.
 */
function fakeNotion({ rows = {}, fail = null } = {}) {
  const calls = { queryDatabase: {}, getPage: 0, getPageBlocks: 0 };
  const maybeFail = () => { if (fake.fail) throw fake.fail; };
  const fake = {
    fail,
    calls,
    async queryDatabase(id) {
      calls.queryDatabase[id] = (calls.queryDatabase[id] ?? 0) + 1;
      maybeFail();
      return rows[id] ?? [{ id: `row-of-${id}` }];
    },
    async getPage(id) { calls.getPage += 1; maybeFail(); return { id, object: 'page' }; },
    async getPageBlocks(id) { calls.getPageBlocks += 1; maybeFail(); return [{ id: `block-of-${id}` }]; },
  };
  return fake;
}

/** A fresh app with its own cache and fake Notion, so no state leaks between tests. */
function makeApp(opts = {}) {
  const cache = opts.cache ?? new Cache();
  const notion = opts.notion ?? fakeNotion();
  const app = createApp({ ttl: 300, ...opts, cache, notion });
  return { app, cache, notion };
}

module.exports = { fakeNotion, makeApp };
