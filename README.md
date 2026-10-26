# VPS Service Template

A GitHub Template Repository for deploying Node.js services to the VPS at `*.vps.sarvinshrivastava.space`.

## Using this template

1. Click **"Use this template"** on GitHub and name your new repo (e.g. `notion-cache`)
2. Add a single GitHub secret to your new repo:
   - `SM_READ_TOKEN` — the read token for the secrets-manager
3. Add your service's secrets to secrets-manager under the `SERVICENAME_*` prefix (see convention below)
4. Push to `main` — the workflow auto-deploys your service

The VPS deploy script handles everything else: port assignment, Nginx vhost creation, and SSL via the wildcard cert at `*.vps.sarvinshrivastava.space`.

## Secret naming convention

Secrets in secrets-manager are namespaced by service name. The prefix is derived by uppercasing the repo name and replacing hyphens with underscores:

| Repo / service name | Secrets prefix    | Example secret          |
|---------------------|-------------------|-------------------------|
| `notion-cache`      | `NOTION_CACHE_`   | `NOTION_CACHE_API_KEY`  |
| `webhook-relay`     | `WEBHOOK_RELAY_`  | `WEBHOOK_RELAY_SECRET`  |
| `my-api`            | `MY_API_`         | `MY_API_DATABASE_URL`   |

At deploy time, `vps-deploy` fetches all secrets matching your service's prefix, strips the prefix, and writes them to `.env` inside the container.

## Adding secrets to secrets-manager

```bash
curl -X POST https://secrets.vps.sarvinshrivastava.space/api/secrets \
  -H "X-API-Key: <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"key":"NOTION_CACHE_API_KEY","value":"your-value","folder":"Root"}'
```

## What gets deployed

- Your service runs inside a Docker container built from the `Dockerfile`
- It is assigned a unique port automatically (starting at 3001, tracked in `/etc/vps-registry/ports.json`)
- An Nginx vhost is created at `<service-name>.vps.sarvinshrivastava.space` with HTTPS
- The container restarts automatically (`unless-stopped`)

## Local development

```bash
cp .env.example .env
# fill in .env values
npm install
npm run dev
```

## Project structure

```
├── .github/workflows/deploy.yml  # CI/CD — only needs SM_READ_TOKEN secret
├── src/index.js                   # Entry point — replace with your code
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## Resume PDF (`/update-resume`, `/resume.pdf`)

The service renders the portfolio's resume PDF from four Notion databases (About, Projects, Timeline, Experience) and serves it. The PDF is kept in memory and on the `resume-data` volume (`/app/data`), and it is re-rendered only when its content or the template changes (a hash gate).

### Routes

| Route | Auth / limit | Success | Errors |
|---|---|---|---|
| `POST /update-resume` | `Authorization: Bearer <token>`. 10 per 15 min per IP, on this route only. | `200 {updated, hash, renderedAt}` | `401 {error:'unauthorized'}`; `503 {error:'not_configured'}` (token or a database id unset); `502 {error:'upstream_unavailable'}` (any Notion or render error; the old PDF is kept); `429` |
| `GET`, `HEAD /resume.pdf` | none, no limiter | `200` PDF with an `ETag` (`304` on `If-None-Match`) | `503 text/plain`, `no-store`, before the first render |

`/api/*` is limited to 400 requests per 15 minutes per IP.

### Environment variables

Each name is also accepted with the `NOTION_CACHE_` prefix (the deploy strips it).

| Variable | Meaning |
|---|---|
| `RESUME_UPDATE_TOKEN` | Bearer token for `POST /update-resume` |
| `RESUME_DB_ABOUT`, `RESUME_DB_PROJECTS`, `RESUME_DB_TIMELINE`, `RESUME_DB_EXPERIENCE` | Notion database ids (dashed or not) |
| `RESUME_DIR` | Optional. Where the PDF is stored. Defaults to `<repo>/data` (`/app/data` in the image). |

At startup the service loads the stored PDF and runs one update. When no PDF existed and Notion fails, it retries after 1, 5 and 15 minutes. If `docker compose down -v` runs on deploy, the volume is wiped and the next start re-renders, which is harmless but slower.

### PLR setup (daily at 03:00 IST)

Use the PLR admin token.

1. `PATCH /v1/clients/{id}` and add:
   - `notion-cache.vps.sarvinshrivastava.space` to `callback_hosts`
   - the exact ref `Root/NOTION_CACHE_RESUME_UPDATE_TOKEN` to `secret_ref_prefixes`
2. `POST /v1/jobs/validate`, then `POST /v1/jobs` with:

   ```json
   {
     "name": "portfolio-update-resume",
     "trigger": {"type": "cron", "cron": "0 3 * * *", "timezone": "Asia/Kolkata"},
     "target": {"type": "http", "http": {"method": "POST", "mode": "sync",
       "url": "https://notion-cache.vps.sarvinshrivastava.space/update-resume",
       "auth": {"bearer_ref": "Root/NOTION_CACHE_RESUME_UPDATE_TOKEN"}}},
     "policy": {"overlap": "skip", "timeout_sec": 120, "max_late_sec": 3600,
       "retry": {"max_attempts": 3, "backoff_sec": 300}, "push_on_failure": true}
   }
   ```

3. Optional: add `"push_url_ref": "<Folder/KEY of an Uptime Kuma push URL>"` to `policy` for an alert when retries run out.
4. Run now: `POST /v1/jobs/{id}/invoke`.

### Failure statuses

- `401`: the token is wrong. PLR does not retry a 4xx.
- `503 not_configured`: a secret is missing. PLR retries a 5xx up to 3 attempts in total, all of them futile, then alerts.
- In both cases, check the secrets.

### Diagnosing the site

When one Notion dataset fails for a long time, the whole site stays on saved data (all four datasets load together or not at all). The per-dataset `data_load_error` events in Umami show which dataset is failing.
