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

---

# Preview branches (UTA-11)

Every pull-request preview gets an **isolated Neon child branch of Staging**
(never Production), with its own `DATABASE_URL`, reviewed migrations applied,
synthetic seed only, and cleanup on PR close.

## How it works

1. PR opened / synchronized → `.github/workflows/preview-db.yml` (`setup` job)
   runs `infra/neon/preview-setup.mjs`:
   - Ensures `preview/pr-<n>` exists as a child of the Staging branch
     (`NEON_STAGING_BRANCH_ID`). Idempotent — re-runs reuse the branch.
   - Waits until the branch is ready (retryable timeout, fails loudly).
   - Runs the reviewed Drizzle migrate from UTA-10 tooling
     (`packages/database/scripts/migrate.ts`), then the synthetic seed
     (`packages/database/scripts/seed.ts`; `assertSeedAllowed` in
     `packages/database/src/seed.ts` refuses production, and
     production-looking URLs are refused).
   - Upserts a **branch-scoped** Vercel `DATABASE_URL` (`target: preview`,
     `gitBranch: <PR head branch>`) so only that PR's preview deployments
     receive this branch's URL. See `infra/vercel/PREVIEW_WIRING.md`.
   - Logs a redacted correlation record (PR ↔ Neon branch id, hostname only —
     never connection strings).
2. PR closed → `cleanup` job runs `preview-cleanup.mjs`: deletes the Neon
   branch and the branch-scoped Vercel env. Idempotent (already-gone = success).
3. Nightly + on demand → `preview-reconcile.mjs` deletes stranded
   `preview/pr-*` branches (TTL default 72h via `PREVIEW_BRANCH_TTL_HOURS`,
   or PR-closed via the GitHub API). `--dry-run` lists without deleting.

Neon↔Vercel native integration was evaluated: it cannot guarantee
child-of-**Staging** per PR with branch-scoped wiring, so the repo owns the
flow above with repeatable scripts. If the integration later supports it, the
workflow can delegate branch creation to it and keep migrate/seed/guards here.

## Deploy wiring inventory (summary; full matrix in `infra/vercel/PREVIEW_WIRING.md`)

| Vercel env                                   | Source branch  | Neon source                         | `DATABASE_URL` ownership             |
| -------------------------------------------- | -------------- | ----------------------------------- | ------------------------------------ |
| Production                                   | `main`         | Neon `main`/`prod`                  | Production URL, Production env only  |
| Staging (`preview` target, `develop` branch) | `develop`      | Neon `staging` branch               | Staging URL, scoped to `develop`     |
| Preview (PR)                                 | PR head branch | `preview/pr-<n>` (child of staging) | Per-PR URL, scoped to PR head branch |

`web/` is linked to Vercel with rootDirectory `web` (monorepo). Production and
Staging credentials are never written to Preview scope.

## Operator runbook

Required secrets (GitHub Actions secrets / operator env):

```bash
NEON_API_KEY=...            # Neon API key (branches + connection URIs)
NEON_PROJECT_ID=...         # Neon project id
NEON_STAGING_BRANCH_ID=...  # parent of every preview branch (the staging branch id)
NEON_PRODUCTION_BRANCH_ID=... # guard only: setup refuses if parent == this
NEON_DATABASE_NAME=neondb   # optional (Neon project default; override per project)
NEON_ROLE_NAME=neondb_owner # optional (Neon project default; override per project)
PREVIEW_BRANCH_TTL_HOURS=72 # optional reconciler TTL
VERCEL_TOKEN=...            # Vercel API token (branch-scoped env wiring)
VERCEL_PROJECT_ID=...       # Vercel project id
VERCEL_TEAM_ID=...          # optional
GITHUB_TOKEN=...            # reconciler PR-closed checks (Actions provides this)
```

Manual runs (replace `123` / `feat/foo`):

```bash
# Plan without touching anything (cleanup plan needs no secrets;
# setup plan needs NEON_STAGING_BRANCH_ID to validate the parent):
PR_NUMBER=123 GIT_BRANCH=feat/foo node infra/neon/preview-setup.mjs --dry-run --skip-migrate --skip-vercel
PR_NUMBER=123 GIT_BRANCH=feat/foo node infra/neon/preview-cleanup.mjs --dry-run --skip-vercel
node infra/neon/preview-reconcile.mjs --dry-run

# Live setup (migrates + seeds the new branch, wires Vercel):
PR_NUMBER=123 GIT_BRANCH=feat/foo APP_ENV=preview node infra/neon/preview-setup.mjs

# Live cleanup / reconcile:
PR_NUMBER=123 GIT_BRANCH=feat/foo node infra/neon/preview-cleanup.mjs
node infra/neon/preview-reconcile.mjs
```

Failure handling: every step exits non-zero with an actionable message and the
workflow fails visibly. Retry = re-run the workflow for the same PR (branch
reuse + idempotent migrate make it safe). A migrate/seed failure leaves the
branch in place for inspection and does NOT report ready.

## Verifying isolation (two PRs can't see each other's writes)

```bash
# 1. Open two test PRs (e.g. #101, #102) and let setup finish.
# 2. Confirm distinct branches + distinct hosts (redacted setup logs):
#    [preview-setup] {"action":"ready",...,"neonBranchName":"preview/pr-101","databaseHost":"ep-aaa..."}
#    [preview-setup] {"action":"ready",...,"neonBranchName":"preview/pr-102","databaseHost":"ep-bbb..."}
# 3. Write a row through preview #101 (app UI or psql on its branch URL),
#    then query preview #102's branch: the row must be absent.
# 4. Close both PRs and confirm cleanup evidence:
#    [preview-cleanup] {"action":"branch-deleted",...,"neonBranchName":"preview/pr-101",...}
#    (or run the reconciler dry-run: stranded branches must list zero rows).
```

Pure-logic checks run without credentials: `pnpm --filter @tokoboss/neon-preview test`
(`node --test preview-lib.test.mjs`: naming, staging-parent guard,
preview-env guard, redaction, TTL, stubbed Neon/Vercel API flows).
