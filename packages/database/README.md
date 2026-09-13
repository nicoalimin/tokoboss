# `@tokoboss/database` (UTA-10)

Database access layer. Implements the domain `Repository<T, ID>` and
`DatabasePort` contracts with Drizzle ORM + Neon Postgres. The domain layer
never imports Drizzle or any driver directly (boundary-tested).

## Layout

- `src/schema/` — Drizzle table definitions (source of truth for generation).
  Conventions in `helpers.ts`: UUID PKs, UTC `timestamptz`, explicit FK actions.
- `src/adapters/` — `DrizzleDatabase` (Neon HTTP, transaction-capable) and
  `InMemoryDatabase` (tests, snapshot/rollback semantics, no credentials).
- `src/db/` — `migrateWithAdvisoryLock()` (single controlled migration step),
  `listAppliedMigrations()` / `countAppliedMigrations()` (history).
- `src/seed/` — deterministic synthetic seed generator (no production data).
- `src/scripts/` — CLIs: `migrate.ts`, `seed.ts`, `check.ts`.
- `drizzle.config.ts` — Kit config: schema → `infra/drizzle` (committed SQL).

## Scripts

| Script                        | Purpose                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `db:generate`                 | Generate SQL from schema into `infra/drizzle` (review before commit)             |
| `db:check`                    | `drizzle-kit check` + journal integrity + clean-tree + schema snapshot (CI)      |
| `db:migrate`                  | Migrate `DATABASE_URL` with advisory lock; refuses production targets            |
| `db:migrate:prod`             | Controlled production step (`--allow-production`, requires `APP_ENV=production`) |
| `db:seed` / `db:seed:dry-run` | Synthetic seed (non-production only; `--dry-run` prints JSON, no DB)             |

## Transactions

```ts
import { DrizzleDatabase, withTransaction } from '@tokoboss/database';

const db = new DrizzleDatabase(process.env.DATABASE_URL);
await withTransaction(db, async (tx) => {
  await tx.createStore({ id, name });
  await tx.createProduct({ id, storeId: id, sku, name, priceCents });
});
```

Errors inside the callback roll back all writes. Tests use
`InMemoryDatabase` through the same `DatabasePort` — see
`tests/db-transaction/`.
