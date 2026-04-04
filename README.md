# Sigil

A self-hosted DMARC report viewer and email authentication dashboard. Connects to your IMAP mailbox, parses aggregate reports, and gives you a clear picture of your domain's email authentication health.

## Features

- **IMAP ingestion** — connects to any IMAP mailbox, pulls DMARC (RUA) and TLS-RPT attachments (`.xml`, `.xml.gz`, `.zip`, `.json`, `.json.gz`)
- **Report parsing** — RFC 7489 DMARC aggregate reports and RFC 8460 TLS-RPT reports, fully parsed and stored
- **Dashboard** — pass rates, timelines, top senders, domain overview
- **DNS health checks** — MX, DMARC, SPF, DKIM, TLSA/DANE, MTA-STS, and TLS Reporting records with warnings and recommendations
- **Detected domains** — domains from your reports appear on the DNS page for one-click health checks
- **Background fetch** — automatic IMAP polling on a configurable interval (default: every 6 hours)
- **Encryption at rest** — IMAP passwords encrypted with Fernet
- **Single-container deploy** — one Docker image, bundled frontend, auto-runs migrations on startup

<img width="2165" height="1283" alt="image" src="https://github.com/user-attachments/assets/f8b703d4-ebcc-4f11-b965-2375d8275a51" />


## What it does

## Quick Start (Docker Compose)

This is the recommended way to run Sigil. No need to clone the repo.

```bash
# 1. Download the compose file and example env
curl -LO https://raw.githubusercontent.com/Paul1404/Sigil/main/docker-compose.yml
curl -LO https://raw.githubusercontent.com/Paul1404/Sigil/main/.env.example

# 2. Create your .env and fill in the values
cp .env.example .env

# 3. Generate required secrets
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# 4. Start everything
docker compose up -d
```

Open `http://localhost:8000` and log in with the `ADMIN_PASSWORD` you set in `.env`.

### Updating

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on container start.

## Configuration

All configuration is through environment variables. See `.env.example` for the full list.

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | Password for the bundled PostgreSQL container |
| `ENCRYPTION_KEY` | Yes | Fernet key for encrypting IMAP passwords at rest |
| `ADMIN_PASSWORD` | Yes | Password to log into the dashboard |
| `SECRET_KEY` | Yes | Signs JWT tokens — use a random string |
| `FETCH_INTERVAL_HOURS` | No | Hours between automatic IMAP fetches (default: `6`) |
| `SIGIL_PORT` | No | Host port to expose (default: `8000`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins. Leave empty for same-origin |
| `DATABASE_URL` | No | Override to use an external PostgreSQL instead of the bundled one. Must use `postgresql+asyncpg://` scheme |

## Using an External Database

If you already run PostgreSQL, set `DATABASE_URL` in your `.env` and remove the `sigil-db` service from `docker-compose.yml`:

```bash
DATABASE_URL=postgresql+asyncpg://user:password@your-db-host:5432/sigil
```

## Reverse Proxy

Sigil runs on port 8000 by default. Put it behind your existing reverse proxy (nginx, Caddy, Traefik, etc.) and set `CORS_ORIGINS` to your public URL:

```bash
CORS_ORIGINS=https://sigil.example.com
```

## Adding Mailboxes

After logging in, go to **Settings** and add your IMAP mailbox. Sigil will scan for DMARC and TLS-RPT report emails. You can trigger a manual fetch or wait for the next scheduled run.

Most DMARC report providers (Google, Microsoft, Yahoo, etc.) send reports as email attachments to the `rua` address in your DMARC record. Point that to a mailbox Sigil can read.

## Building from Source

If you prefer to build locally instead of pulling from `ghcr.io`:

```bash
git clone https://github.com/Paul1404/Sigil.git && cd Sigil
docker compose up -d --build
```

Or for development without Docker:

```bash
# Backend (Python 3.12+)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload

# Frontend (Node 20+)
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` to `localhost:8000`.

## API

```
GET    /api/health                  Health check
GET    /api/dashboard/stats         Aggregate stats
GET    /api/dashboard/timeline      Pass/fail over time
GET    /api/reports                 List DMARC reports (filterable by domain, date)
GET    /api/reports/{id}            Single report with records
GET    /api/tls-reports             List TLS-RPT reports
GET    /api/tls-reports/summary     TLS report summary by domain
POST   /api/dns/check               Run DNS health checks for a domain
GET    /api/dns/domains             Domains detected from ingested reports
GET    /api/mailboxes               List configured mailboxes
POST   /api/mailboxes               Add a mailbox
PUT    /api/mailboxes/{id}          Update a mailbox
DELETE /api/mailboxes/{id}          Delete a mailbox
POST   /api/mailboxes/{id}/fetch    Trigger manual fetch
GET    /api/inbox                   Non-report emails
```

## Project Layout

```
backend/
  main.py           FastAPI app, all routes
  models.py         SQLAlchemy models
  schemas.py        Pydantic request/response schemas
  dns_checker.py    MX, DMARC, SPF, DKIM, TLSA, MTA-STS, TLSRPT checks
  imap_fetcher.py   IMAP connection + email processing
  dmarc_parser.py   RFC 7489 XML report parser
  tls_parser.py     RFC 8460 TLS-RPT JSON parser
  scheduler.py      Background fetch jobs (APScheduler)
  database.py       Async DB engine + sessions
  config.py         Settings from env vars
  encryption.py     Fernet encrypt/decrypt for IMAP passwords
  auth.py           JWT auth + password verification
  alembic/          Database migrations
frontend/
  src/
    pages/          Dashboard, Reports, DNS, Settings, Inbox
    components/     Shared UI components
    api.js          API client
```

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy (async), Alembic, PostgreSQL, dnspython, APScheduler
- **Frontend:** React 19, Vite, Tailwind CSS v4, Recharts
- **Container:** Multi-stage Docker build (Node + Python)

## License

MIT
