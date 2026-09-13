# Neon Postgres (UTA-10)

Neon is the system of record. Drizzle (under `packages/database`, SQL
committed to `infra/drizzle`) is the only schema migration mechanism.

## Environments and branches

| App env        | Neon branch                             | Wired via                                                   |
| -------------- | --------------------------------------- | ----------------------------------------------------------- |
| `production`   | `main` (or `prod`) branch               | `DATABASE_URL` = pooled production URL, Production env only |
| `staging`      | dedicated `staging` branch              | `DATABASE_URL` = staging URL, never production credentials  |
| `preview` (PR) | ephemeral branch per PR (UTA-11)        | `DATABASE_URL` = PR branch URL, isolated from production    |
| `local`        | local Postgres or a personal dev branch | `DATABASE_URL` in `.env.local`                              |

Preview deployments must **never** receive production credentials —
see `infra/vercel/README.md` (Preview Isolation) and the guards in
`packages/database/src/scripts/migrate.ts` / `synthetic-seed.ts`.

## Creating a branch (manual, until UTA-11 automates preview branches)

```bash
# Neon dashboard or CLI: create a branch off production/main,
# then point the target environment at its connection string:
DATABASE_URL=postgresql://<user>:<password>@<endpoint>/<db>?sslmode=require
```

Pooled URLs (`-pooler` endpoints) are recommended for serverless/CI;
use the direct endpoint for the one-shot migration step if the pooler
restricts DDL.

## First migration (acceptance: empty non-production branch)

```bash
# 1. Create an empty Neon branch for testing.
# 2. Apply the reviewed initial migration:
DATABASE_URL=<empty-branch-url> pnpm --filter @tokoboss/database db:migrate
# 3. Re-run: must report "No pending work".
DATABASE_URL=<empty-branch-url> pnpm --filter @tokoboss/database db:migrate
# 4. (Optional) load synthetic data for manual verification:
APP_ENV=preview DATABASE_URL=<empty-branch-url> pnpm --filter @tokoboss/database db:seed
```

## Production migration

One controlled step with an advisory lock (serializes concurrent migrators):

```bash
APP_ENV=production DATABASE_URL=<prod-url> pnpm --filter @tokoboss/database db:migrate:prod
```

The runner acquires `pg_advisory_lock` on a stable namespace key, applies
pending migrations from `infra/drizzle`, then releases the lock. Without
`--allow-production` (i.e. plain `db:migrate`) a production-looking target
is refused.

## History

Applied migrations are recorded in `drizzle.__drizzle_migrations` on each
branch. Query it via `listAppliedMigrations()` in
`packages/database/src/db/migration-history.ts`.
