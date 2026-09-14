# Neon Postgres (UTA-10)

Neon is the system of record. One project, isolated branches per environment.

## Branch strategy

| Environment  | Neon branch                                     | `DATABASE_URL` source                                           |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------- |
| Production   | `main` (protected)                              | Vercel **Production** env only                                  |
| Staging      | `staging`                                       | Vercel **Preview**-scoped staging value / dedicated staging env |
| Preview (PR) | ephemeral branch per PR (UTA-11 automates this) | Vercel **Preview** env — never production credentials           |
| Local        | `dev` branch or local Postgres                  | `.env.local` (gitignored)                                       |

Preview deployments must **never** receive production credentials (see
`infra/vercel/README.md` → Preview Isolation).

## Connection strings

Neon provides two hostnames per branch:

- **Direct** (`…neon.tech`) — use for **migrations** (`db:migrate`, `db:migrate:prod`).
  The migrator uses `max: 1` and runs DDL; poolers can interfere with advisory
  locks and multi-statement migrations.
- **Pooled** (`…-pooler.…neon.tech`, `-pooler` + `-pgbouncer=true`) — use for the
  **runtime adapter** (`DATABASE_POOL_URL`). Serverless functions must pool.

Set both in Vercel; `createDb()` takes the pooled URL, migration scripts take the
direct URL:

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/tokoboss?sslmode=require
DATABASE_POOL_URL=postgresql://user:pass@ep-xxx-pooler.neon.tech/tokoboss?sslmode=require&pgbouncer=true
```

## Verifying the initial migration on an empty branch (acceptance)

```bash
# 1. Create an empty non-production branch in the Neon console.
# 2. From the repo root, with DATABASE_URL pointed at that branch:
DATABASE_URL=postgresql://… pnpm --filter @tokoboss/database db:migrate
# → "Migrations up to date (1/1 applied, no pending work)."

# 3. Re-run: must be safe and report no pending work.
DATABASE_URL=postgresql://… pnpm --filter @tokoboss/database db:migrate

# 4. Optional synthetic data (never production data):
APP_ENV=preview DATABASE_URL=postgresql://… pnpm --filter @tokoboss/database db:seed
```

History is visible in the `drizzle.__drizzle_migrations` table on the branch.

## Advisory lock

`runMigrations()` holds `pg_advisory_lock(hashtext('tokoboss_migrations'))` for the
whole migrate step. Concurrent deploys targeting the same branch serialize; the
lock is session-scoped and always released (`finally`), even on failure.

## What lives where

- `infra/drizzle/` — committed migration SQL + journal (the pipeline).
- `infra/neon/` (this doc) — branch/topology notes, no credentials.
- `packages/database/` — adapter, schema, scripts, tests.
- Credentials live **only** in Vercel env vars / `.env.local` — never in git,
  tests, or seeds (CI and `assertSeedAllowed` enforce this).
