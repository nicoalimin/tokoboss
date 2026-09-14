# Drizzle Migration Pipeline (UTA-10)

Drizzle is the **only** schema migration mechanism. Neon Postgres is the system of record.

## The pipeline

```
generate → review → test → migrate
```

1. **Generate** — edit `packages/database/src/schema/*`, then run from the repo root:
   ```bash
   pnpm --filter @tokoboss/database db:generate
   ```
   This writes committed SQL under `infra/drizzle/` (`NNNN_name.sql` + `meta/_journal.json` + `meta/NNNN_snapshot.json`).
2. **Review** — the generated SQL is a code-review artefact. Check table/column types,
   defaults (`gen_random_uuid()`, `now()` UTC), FK actions, and indexes. CI fails on
   uncommitted generated files.
3. **Test** — `pnpm --filter @tokoboss/database test` applies `0001_initial.sql` to an
   empty in-memory database (PGlite) and runs the transaction integration test.
   To verify against a real Neon branch, point `DATABASE_URL` at an **empty
   non-production branch** and run `db:migrate`, then `db:seed`.
4. **Migrate** — non-production:
   ```bash
   DATABASE_URL=postgresql://… db:migrate   # pnpm --filter @tokoboss/database db:migrate
   ```
   Production (single controlled step, advisory lock, explicit confirmation):
   ```bash
   APP_ENV=production ALLOW_PROD_MIGRATE=true DATABASE_URL=postgresql://… db:migrate:prod
   ```

## Hard rules

- **Never `drizzle-kit push`** for staging or production. Push is local-only and
  bypasses review, history, and locking.
- **Never renumber `main`.** On rebase conflicts, branch migrations move after
  `main` (`max+1, …`), then update `meta/_journal.json` (see `AGENTS.md`).
- **Re-running migrate is safe.** The migrator tracks applied migrations in the
  `drizzle.__drizzle_migrations` history table and reports `no pending work` when converged.
- **One migrator at a time.** Every migrate acquires
  `pg_advisory_lock(hashtext('tokoboss_migrations'))` and releases it afterwards,
  so concurrent deploys serialize instead of racing.

## Conventions

- **UUID primary keys** — `uuid('id').primaryKey().defaultRandom()` →
  `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. See `packages/database/src/schema/helpers.ts#uuidPk`.
- **UTC timestamps** — `timestamptz` with `DEFAULT now()`, `created_at` immutable,
  `updated_at` refreshed via `$onUpdate`. See `helpers.ts#utcTimestamps`.
- **Foreign keys** — declare delete behaviour explicitly:
  owned child rows (audit events) use `onDelete: 'cascade'`; business references
  prefer `restrict`. Indexes on `(tenant_id, created_at)`-style access paths.
- **Every business table references `tenants.id`** (tenant isolation boundary).

## Migration history

- Source of truth in git: `infra/drizzle/meta/_journal.json`.
- Source of truth in the database: the `drizzle.__drizzle_migrations` table (written by the
  migrator; never edit by hand).
- `getMigrationStatus()` diffs the two; `db:check` (CI) fails when the journal and
  the `NNNN_*.sql` files disagree, when sequence numbers duplicate, or when
  generated files are uncommitted.

## Expand/contract (destructive or locking changes)

Zero-downtime changes go through two deploys. The migrator runs **before** the new
code serves traffic, so each migration must be compatible with both the old and
the new code.

| Change                      | Expand (migrate 1, deploy code that tolerates both)                                                                                          | Contract (migrate 2, after old code is gone)            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Rename column `a` → `b`     | Add nullable `b`; dual-write; backfill in batches                                                                                            | Drop `a` once no reader uses it                         |
| Drop column / table         | Stop reading it in code first, deploy                                                                                                        | Drop in a later migration                               |
| Add `NOT NULL`              | Add nullable → backfill → deploy code that always writes                                                                                     | `ALTER … SET NOT NULL` (short lock; batch large tables) |
| Change type                 | Add new column, backfill, dual-read                                                                                                          | Drop old column                                         |
| Add index                   | `CREATE INDEX CONCURRENTLY` (cannot run inside a transaction block — run manually, not via the migrator, or accept the lock on small tables) | —                                                       |
| Tighten FK / add constraint | Validate with `NOT VALID`, then `VALIDATE CONSTRAINT`                                                                                        | Enforce in code                                         |

Rules of thumb:

- Prefer additive, backward-compatible migrations. A migration that breaks the
  currently-deployed code must not ship.
- `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT …` rewrites large tables — split
  into add-nullable → backfill (batched) → set-not-null.
- Locking statements (`CREATE INDEX` without `CONCURRENTLY`, `ALTER TYPE`,
  `DROP`) need a maintenance window or manual execution with the advisory lock held.
- Document any manual step in the migration PR; the migrator only runs committed
  `infra/drizzle/*.sql` in journal order.

## Scripts (`@tokoboss/database`)

| Script            | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `db:generate`     | `drizzle-kit generate` → committed SQL (review required)                             |
| `db:check`        | CI gate: journal↔SQL sync, no duplicate sequences, tree clean                        |
| `db:check:kit`    | `drizzle-kit check` — SQL-level drift detection (needs schema only)                  |
| `db:migrate`      | advisory-locked migrate + converge check (non-prod)                                  |
| `db:migrate:prod` | single controlled production step (`APP_ENV=production` + `ALLOW_PROD_MIGRATE=true`) |
| `db:seed`         | deterministic synthetic seed (refuses `APP_ENV=production`)                          |

## Known issue: `db:check:kit` fails on main (UTA-12 documented, not fixed here)

`pnpm --filter @tokoboss/database db:check:kit` fails with:

```
[../../infra/drizzle/meta/0001_snapshot.json, ../../infra/drizzle/meta/0002_snapshot.json]
are pointing to a parent snapshot: ... which is a collision.
```

Root cause (verified on `main` @ `1e2e466`, independent of UTA-12 changes):

1. `meta/0002_snapshot.json` has `prevId: 00000000-…` (genesis) instead of
   chaining `0001_snapshot.json`'s id — it was generated as a standalone
   snapshot, not as a child of 0001.
2. `0002_snapshot.json` (and `0002_initial_schema.sql`) define
   `stores`/`products`/`stock_moves`, which are absent from
   `packages/database/src/schema/*` (only `tenants` + `audit_events`).
   So even a re-chained snapshot would report schema drift.

Fixing this requires deciding the intended schema state and regenerating
snapshots — migration-pipeline ownership (UTA-10 follow-up). Until then:

- The **blocking** migration gate in CI (`ci.yml`) is `db:check`
  (journal↔SQL sync, no dup sequences, tree clean) — green.
- `db:check:kit` runs in CI as **non-blocking** (`continue-on-error`) so the
  baseline stays green from a clean checkout while the failure stays visible.
- Do not "fix" by hand-editing snapshots; regenerate via `db:generate` after
  the schema source is reconciled, and never renumber `main` migrations.
