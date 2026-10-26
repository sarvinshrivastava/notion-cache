require('dotenv').config();
const { createApp } = require('./app');
const { Cache } = require('./cache');
const notion = require('./notion');
const { optionsFromEnv, parseResumeConfig } = require('./config');
const { createStore } = require('./resume/store');
const { createResumeService } = require('./resume/service');

const PORT = process.env.PORT || 3000;

const { token, dbIds, dir } = parseResumeConfig();
if (!token || Object.values(dbIds).some(id => !id)) {
  console.warn('RESUME_UPDATE_TOKEN or a RESUME_DB_* id is not set: /update-resume answers 503');
}

const cache = new Cache();
const service = createResumeService({ notion, store: createStore(dir), dbIds });
const app = createApp({ cache, notion, ...optionsFromEnv(), resume: { service, token } });

setInterval(() => cache.cleanup(), 10 * 60 * 1000);
app.listen(PORT, () => {
  console.log(`Notion cache running on port ${PORT}`);
  service.warmup();
});
