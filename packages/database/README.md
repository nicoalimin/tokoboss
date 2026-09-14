# `@tokoboss/database` — Drizzle + Neon adapter (UTA-10)

Infrastructure-layer adapter implementing domain `Repository` ports.
Drizzle is the only schema migration mechanism; see `infra/drizzle/README.md`
for the pipeline and `infra/neon/README.md` for topology.

## Usage

```ts
import { createDb, DrizzleTenantRepository } from '@tokoboss/database';

// Runtime: prefer the pooled URL in serverless environments.
const db = createDb(process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL);

// Transaction-capable unit of work (commit on resolve, rollback on throw).
await db.withTransaction(async (tx) => {
  const repos = new DrizzleTenantRepository(tx);
  await repos.createWithAuditEvent(
    { name: 'Acme', slug: 'acme' },
    { action: 'tenant.created', payload: { synthetic: true } }
  );
});

await db.close();
```

## Layout

- `src/schema/` — Drizzle tables + `helpers.ts` (UUID/UTC conventions, FK actions).
- `src/db.ts` — `createDb()` adapter factory + `withTransaction` wrapper.
- `src/migrate.ts` — advisory-locked migrator, `getMigrationStatus()`,
  `__drizzle_migrations` history readers.
- `src/seed.ts` — deterministic synthetic seed (refuses `APP_ENV=production`).
- `src/repositories/` — `DrizzleTenantRepository` (domain `Repository` port).
  Dialect-agnostic: works with postgres-js in production and PGlite in tests.
- `scripts/` — `migrate`, `migrate-prod` (single controlled step), `seed`, `check`.
- `src/__tests__/` — transaction integration test (PGlite, no credentials) +
  migration-artefact tests (journal↔SQL sync, conventions).
- `drizzle.config.ts` — schema in, committed SQL out (`../../infra/drizzle`).

## Scripts

```bash
pnpm --filter @tokoboss/database db:generate       # schema → infra/drizzle/*.sql (review!)
pnpm --filter @tokoboss/database db:check          # CI gate (journal sync, tree clean)
pnpm --filter @tokoboss/database db:migrate        # migrate non-prod (DATABASE_URL)
pnpm --filter @tokoboss/database db:seed           # synthetic seed (non-prod only)
pnpm --filter @tokoboss/database test              # vitest (PGlite, no DB needed)
```

Production migrate is intentionally awkward — it must be:

```bash
APP_ENV=production ALLOW_PROD_MIGRATE=true DATABASE_URL=… pnpm --filter @tokoboss/database db:migrate:prod
```
