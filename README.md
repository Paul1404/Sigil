# Sigil

DMARC report viewer. Connects to an IMAP mailbox, pulls aggregate reports, parses them, and shows you what's going on with your email authentication.

I built this because reading raw DMARC XML is miserable and most existing tools are either expensive SaaS or abandoned PHP projects from 2016.

## What it does

- Connects to any IMAP mailbox and grabs DMARC RUA attachments (`.xml`, `.xml.gz`, `.zip`)
- Parses RFC 7489 aggregate reports — source IPs, message counts, DKIM/SPF alignment, disposition
- Dashboard with pass rates, timelines, top senders
- DNS health checks for DMARC, SPF, DKIM, and TLSA records
- Background fetch every 6 hours (APScheduler)
- IMAP passwords encrypted at rest with Fernet

## Stack

**Backend:** FastAPI, SQLAlchemy (async), Alembic, PostgreSQL (asyncpg), dnspython, APScheduler

**Frontend:** React 19, Vite, Tailwind CSS v4

**Deploys with:** Docker, Railway

## Getting started

You'll need Python 3.12+, Node 20+, and PostgreSQL.

```bash
git clone <repo-url> && cd sigil
cp .env.example .env
# fill in your .env
```

Backend:

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server proxies `/api` to `localhost:8000`.

## Environment variables

- `DATABASE_URL` — Postgres connection string. Must use `postgresql+asyncpg://` scheme.
- `ENCRYPTION_KEY` — Fernet key. Generate one: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `ADMIN_PASSWORD` — Password for the dashboard login.
- `SECRET_KEY` — Signs JWT tokens. Change from the default.
- `CORS_ORIGINS` — Comma-separated allowed origins. Default: `http://localhost:5173`
- `FETCH_INTERVAL_HOURS` — Hours between auto-fetches. Default: `6`

## API

```
GET  /api/health                  Health check
GET  /api/dashboard/stats         Aggregate stats
GET  /api/dashboard/timeline      Pass/fail over time
GET  /api/reports                 List reports (filterable)
GET  /api/reports/{id}            Single report with records
POST /api/dns/check               DNS checks for a domain
GET  /api/mailboxes               List configured mailboxes
POST /api/mailboxes               Add a mailbox
PUT  /api/mailboxes/{id}          Update a mailbox
DELETE /api/mailboxes/{id}        Delete a mailbox
POST /api/mailboxes/{id}/fetch    Manual fetch
```

## Deploying to Railway

[![Deploy on Railway](https://railway.app/button.svg)](#)

1. Create a new Railway project from this GitHub repo. It'll detect the Dockerfile.
2. Add a PostgreSQL database to the project (New → Database → PostgreSQL).
3. Set env vars on the Sigil service:
   - `DATABASE_URL` — use the Railway-provided credentials but swap the scheme to `postgresql+asyncpg://`
   - `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `SECRET_KEY` — see above
   - `CORS_ORIGINS` — your Railway domain (you can use `*` until you have it)
4. Deploy. The Dockerfile builds the React app, installs the backend, runs migrations on startup, and launches Uvicorn.
5. Generate a public domain under Settings → Networking, then update `CORS_ORIGINS` to match.

**Common issues:**
- DB connection errors → check that `DATABASE_URL` uses `postgresql+asyncpg://`, not `postgres://`
- CORS errors → make sure `CORS_ORIGINS` matches your domain exactly, including `https://`
- Build fails → you probably need to commit `package-lock.json`

## Project layout

```
backend/
  main.py           FastAPI app, all routes
  models.py         SQLAlchemy models
  schemas.py        Pydantic request/response schemas
  database.py       Async DB engine + sessions
  config.py         Settings from env vars
  encryption.py     Fernet encrypt/decrypt
  imap_fetcher.py   IMAP connection + email processing
  dmarc_parser.py   XML report parser
  dns_checker.py    DNS lookups
  scheduler.py      Background fetch jobs
  alembic/          Migrations
frontend/
  src/
    App.jsx
    pages/          Dashboard, Reports, DNS, Settings
    components/     Shared UI components
```
