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

### Prerequisites

- A [Railway](https://railway.app) account (free tier available)
- This repository pushed to a GitHub account

### Step 1 -- Create a New Railway Project

1. Log in to [railway.app](https://railway.app) and click **New Project**.
2. Select **Deploy from GitHub repo**.
3. Connect your GitHub account if you haven't already, then select the **Sigil** repository.
4. Railway will detect the `Dockerfile` and `railway.toml` automatically -- don't deploy yet, you need a database first.

### Step 2 -- Add a PostgreSQL Database

1. Inside your project, click **New** → **Database** → **Add PostgreSQL**.
2. Railway provisions a PostgreSQL instance and exposes connection variables automatically.
3. Click on the PostgreSQL service and go to the **Variables** tab. Copy the value of `DATABASE_URL`.

### Step 3 -- Configure Environment Variables

1. Click on your **Sigil** service (the app, not the database).
2. Go to the **Variables** tab and add the following:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Replace the scheme with `postgresql+asyncpg://` -- e.g. `postgresql+asyncpg://user:pass@host:port/dbname`. You can reference Railway's provided `DATABASE_URL` and adjust the scheme, or build the URL from the individual `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, and `PGDATABASE` variables. |
| `ENCRYPTION_KEY` | A Fernet key. Generate one locally with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CORS_ORIGINS` | Your Railway app URL, e.g. `https://sigil-production.up.railway.app` (shown after first deploy). Use `*` initially if unsure. |
| `FETCH_INTERVAL_HOURS` | `6` (optional, defaults to 6) |

> **Tip:** Railway auto-injects a `PORT` variable. The `Dockerfile` and `railway.toml` already reference `${PORT:-8000}`, so no action is needed for the port.

### Step 4 -- Deploy

1. Once the variables are set, click **Deploy** (or push a new commit to trigger a deploy).
2. Railway builds the Docker image using the multi-stage `Dockerfile`:
   - Stage 1 builds the React frontend (`npm run build`).
   - Stage 2 installs the Python backend and copies the built frontend assets.
3. On startup the container runs Alembic migrations (`alembic upgrade head`) and then starts the Uvicorn server.
4. The health check at `/api/health` confirms the service is running.

### Step 5 -- Get Your Public URL

1. Click on the Sigil service and go to the **Settings** tab.
2. Under **Networking**, click **Generate Domain** to get a public `*.up.railway.app` URL (or add a custom domain).
3. Copy the URL and update the `CORS_ORIGINS` variable to match it (e.g. `https://sigil-production.up.railway.app`). This triggers an automatic redeploy.

### Step 6 -- Verify the Deployment

1. Open your Railway URL in a browser -- you should see the Sigil dashboard.
2. Navigate to **Settings** in the app to add an IMAP mailbox.
3. Trigger a manual fetch or wait for the auto-fetch scheduler to run.

### Troubleshooting

- **Database connection errors** -- Ensure `DATABASE_URL` uses the `postgresql+asyncpg://` scheme, not `postgresql://` or `postgres://`.
- **CORS errors in the browser** -- Verify `CORS_ORIGINS` matches your Railway domain exactly (including `https://`).
- **Build failures** -- Check the Railway build logs. The most common issue is a missing `package-lock.json` -- run `npm install` locally and commit the lock file.
- **Viewing logs** -- Click on the Sigil service in Railway and open the **Logs** tab to see real-time application output.
