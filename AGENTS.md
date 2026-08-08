# Repository guidance

This is the canonical instruction file for this repository. Claude Code loads it through
`CLAUDE.md`.

## Start here

- Inspect branch, upstream divergence, status, and diff before editing.
- Preserve pre-existing changes and keep unrelated work out of the patch.
- Use the repository's existing runtime, package manager, framework, and deployment model.
- Do not refactor an existing project into the preferred new-project stack unless explicitly requested.
- Verify current documentation before changing version-dependent dependencies or hosting behavior.

## Project

Sigil is a self-hosted DMARC, TLS-RPT, and email-authentication dashboard.

The backend is FastAPI, SQLAlchemy, Alembic, and PostgreSQL. The frontend is React Router, Vite, Tailwind CSS, and npm. Deployment uses Docker and Railway.

## Project rules

- Keep IMAP credentials and encryption keys server-side and encrypted. Never log mailbox content or secrets.
- Treat report attachments, message metadata, and DNS responses as untrusted input.
- Keep database changes in Alembic migrations.
- Preserve the Python backend and npm frontend split. Do not migrate it to the preferred Bun stack as unrelated work.
- DNS checks are observations. Do not turn them into DNS mutations without explicit authorization.

## Commands

- `docker compose up --build`: run the complete application
- `cd frontend && npm run build`: build the frontend
- Use the backend's configured test and migration commands when changing Python or persistence

## Verification

Run the relevant checks and exercise the affected workflow, endpoint, or generated artifact.
State clearly when authenticated, database, deployment, or live verification was not possible.

## Maintaining instructions

Update `AGENTS.md` when verified, durable repository behavior changes. Keep it concise and
move detailed explanations into `docs/`. Keep `CLAUDE.md` as the compatibility import
unless Claude-specific guidance is genuinely required.
