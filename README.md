# Sigil

**Email authentication, made visible.**

Sigil is a full-stack web application that connects to IMAP mailboxes, fetches and parses DMARC RUA (aggregate) reports, and presents an interactive dashboard showing your email authentication posture. It also provides on-demand DNS health checks for DMARC, SPF, DKIM, and TLSA records.

## Features

- **IMAP Mailbox Integration** -- Connect any IMAP mailbox. Sigil automatically finds and parses DMARC RUA report attachments (`.xml`, `.xml.gz`, `.zip`).
- **DMARC Report Parsing** -- Full RFC 7489 aggregate report parsing with per-record drill-down showing source IPs, message counts, DKIM/SPF alignment, and disposition.
- **Dashboard** -- Overview cards (total reports, domains, pass rate), pass/fail timeline chart, and top sending sources.
- **DNS Health Checks** -- On-demand checks for DMARC, SPF, DKIM, and TLSA records with color-coded pass/warn/fail indicators.
- **Auto-Fetch Scheduler** -- Background scheduler (APScheduler) fetches new reports every 6 hours.
- **Encrypted Credentials** -- IMAP passwords are AES-encrypted at rest using Fernet symmetric encryption.

## Tech Stack

| Layer      | Technology                         |
|------------|------------------------------------|
| Backend    | FastAPI, SQLAlchemy (async), Alembic |
| Frontend   | React 19, Vite, Tailwind CSS v4    |
| Database   | PostgreSQL (asyncpg)               |
| DNS        | dnspython                          |
| Scheduler  | APScheduler                        |
| Deployment | Docker, Railway                    |

## Project Structure

```
sigil/
  backend/
    main.py            # FastAPI app with all API routes
    models.py          # SQLAlchemy ORM models
    schemas.py         # Pydantic v2 request/response schemas
    database.py        # Async database engine and session
    config.py          # Pydantic Settings (env-based config)
    encryption.py      # Fernet encrypt/decrypt for passwords
    imap_fetcher.py    # IMAP connection and email processing
    dmarc_parser.py    # DMARC XML report parser
    dns_checker.py     # DNS record lookups
    scheduler.py       # APScheduler background jobs
    alembic/           # Database migrations
  frontend/
    src/
      App.jsx
      pages/           # Dashboard, Reports, DNS, Settings
      components/      # Reusable UI components
  Dockerfile           # Multi-stage build
  railway.toml         # Railway deployment config
```

## Local Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL

### 1. Clone and configure

```bash
git clone <repo-url> && cd sigil
cp .env.example .env
# Edit .env with your values
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to `http://localhost:8000`.

## Environment Variables

| Variable               | Description                              | Default                                          |
|------------------------|------------------------------------------|--------------------------------------------------|
| `DATABASE_URL`         | PostgreSQL connection string             | `postgresql+asyncpg://user:password@localhost:5432/sigil` |
| `ENCRYPTION_KEY`       | Fernet key for password encryption       | *(required)*                                     |
| `CORS_ORIGINS`         | Comma-separated allowed origins          | `http://localhost:5173`                          |
| `FETCH_INTERVAL_HOURS` | Hours between auto-fetch cycles          | `6`                                              |

Generate an encryption key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## API Endpoints

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| GET    | `/api/health`                 | Health check                   |
| GET    | `/api/dashboard/stats`        | Aggregate dashboard statistics |
| GET    | `/api/dashboard/timeline`     | Pass/fail timeline data        |
| GET    | `/api/reports`                | List reports (filterable)      |
| GET    | `/api/reports/{id}`           | Report detail with records     |
| POST   | `/api/dns/check`              | Run DNS checks for a domain    |
| GET    | `/api/mailboxes`              | List mailbox configurations    |
| POST   | `/api/mailboxes`              | Add a mailbox                  |
| PUT    | `/api/mailboxes/{id}`         | Update a mailbox               |
| DELETE | `/api/mailboxes/{id}`         | Delete a mailbox               |
| POST   | `/api/mailboxes/{id}/fetch`   | Trigger manual fetch           |

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](#)

1. Create a new Railway project
2. Add a PostgreSQL service
3. Deploy this repo with the included `Dockerfile` and `railway.toml`
4. Set the environment variables listed above in the Railway dashboard
