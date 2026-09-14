# Drizzle migrations (UTA-10)

Committed SQL is the only migration mechanism. Flow: **generate → review → test → migrate**.
`drizzle-kit push` is forbidden for staging and production — it bypasses review and history.

## Commands (cwd `packages/database`)

| Command                | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm db:generate`     | Generate SQL + snapshot from `src/schema` into `infra/drizzle` |
| `pnpm db:check`        | Validate journal/SQL consistency (no DB needed)                |
| `pnpm db:migrate`      | Apply committed SQL to `DATABASE_URL` (non-prod)               |
| `pnpm db:migrate:prod` | Single controlled production step + advisory lock              |
| `pnpm db:seed`         | Synthetic seed only; always refuses production                 |

## Workflow

1. Edit schema under `packages/database/src/schema` (UUID PKs via `uuidPk()`,
   UTC `timestamptz` via `utcTimestampColumns()`/`occurredAtColumn()`,
   tenant FKs via `tenantFk()` — see `src/schema/common.ts`).
2. `pnpm db:generate`, then **review the SQL diff** before committing.
   Hand edits are allowed for things the generator cannot know
   (e.g. `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` in `0000`).
3. Test: `pnpm db:check`, `pnpm test`, and apply to an empty non-production
   Neon branch (`DATABASE_URL=<branch-url> pnpm db:migrate`). Re-running must
   report no pending work.
4. Commit the `NNNN_*.sql` + `meta/` files together with the schema change.

## Migration history

- `meta/_journal.json` — ordered, gap-free ledger of migrations (idx 0, 1, 2…).
- `meta/*_snapshot.json` — generator state used for drift detection.
- `__drizzle_migrations` table in each database — what the migrator actually applied.

`db:check` validates journal/SQL consistency. Schema drift (schema edited without
regenerating) is caught in CI by re-running `db:generate` and failing on
`git diff --exit-code -- infra/drizzle`.

## Production migration

`pnpm db:migrate:prod` (`src/scripts/migrate.ts --prod`):

- one `migrate()` call — a single controlled step, no fan-out;
- session-level Postgres advisory lock so concurrent runners serialize;
- requires `MIGRATE_PROD_CONFIRM=1` and a `DATABASE_URL` pointing at production;
- never logs credentials (only redacted host).

## Expand/contract (destructive or locking changes)

`db:check` flags `DROP`/`TRUNCATE` for mandatory review. Ship breaking schema
changes in phases across deploys, never in one migration:

1. **Expand** — add the new column/table/index (nullable or with default);
   backfill in batches; deploy code that writes both shapes, reads the old one.
2. **Migrate reads** — deploy code that reads the new shape (still writes both).
3. **Contract** — a later migration drops the old column/table once no running
   code references it.

Locking operations (`ALTER TYPE … ADD VALUE` is fine; rewriting `ALTER TABLE`,
`CREATE INDEX` without `CONCURRENTLY` on large tables) go through the same
phases during low-traffic windows. `CREATE INDEX CONCURRENTLY` cannot run inside
the migrator's transaction — apply it as a standalone statement instead.

## Rebase rule

Migrations are strictly ordered. On rebase conflicts follow `AGENTS.md`:
never renumber `main`; branch migrations move after `main`'s max sequence,
then fix `meta/_journal.json` and verify with `db:check`.
