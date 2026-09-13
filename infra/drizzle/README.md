# Drizzle Migrations (UTA-10)

Committed generated SQL is the **only** migration mechanism. Drizzle Kit
generates, humans review, CI verifies, and a single controlled step migrates.

## Pipeline: generate → review → test → migrate

```bash
# 1. Edit schema in packages/database/src/schema/
# 2. Generate (from the database package)
pnpm --filter @tokoboss/database db:generate

# 3. Review the new SQL under infra/drizzle/NNNN_*.sql
git diff infra/drizzle/

# 4. Verify consistency (also runs in CI)
pnpm --filter @tokoboss/database db:check

# 5. Test against an empty non-production Neon branch
DATABASE_URL=<non-prod-branch-url> pnpm --filter @tokoboss/database db:migrate
DATABASE_URL=<same-url> pnpm --filter @tokoboss/database db:migrate   # must report "no pending work"

# 6. Migrate staging / production via the single controlled step
APP_ENV=production DATABASE_URL=<prod-url> pnpm --filter @tokoboss/database db:migrate:prod
```

## Rules

- **Never `drizzle-kit push`** for staging or production. Push bypasses
  review and history; it is only acceptable for a throwaway local database.
- **Never renumber `main`.** Migrations are strictly ordered and immutable
  once merged — see `AGENTS.md` (Migration rebase rule).
- Every migration file must be referenced in `meta/_journal.json` with a
  gap-free `idx` and a unique sequence number.
- Re-running `db:migrate` is safe (idempotent): applied migrations are
  skipped via `drizzle.__drizzle_migrations`, and zero pending work is reported.

## Layout

- `NNNN_*.sql` — reviewed migration SQL (statements separated by
  `--> statement-breakpoint`).
- `meta/_journal.json` — ordered migration history (the deploy system of record).
- `meta/*_snapshot.json` — drizzle schema snapshots for `drizzle-kit check`.

## Schema conventions

- UUID primary keys (`gen_random_uuid()`), `timestamptz` UTC timestamps,
  explicit `ON DELETE` on every foreign key — see
  `packages/database/src/schema/helpers.ts`.
- Destructive or locking changes require the expand/contract pattern —
  see [EXPAND_CONTRACT.md](./EXPAND_CONTRACT.md).
