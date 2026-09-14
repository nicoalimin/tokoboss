/**
 * `pnpm db:seed` — insert deterministic synthetic rows into a
 * NON-PRODUCTION database. Never uses production data or credentials.
 */
import { createDb } from '../src/db.js';
import { assertSeedAllowed, insertSyntheticSeed } from '../src/seed.js';

async function main(): Promise<void> {
  const appEnv = process.env.APP_ENV ?? 'local';
  assertSeedAllowed(appEnv);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Refusing to seed without an explicit non-production target.'
    );
    process.exit(1);
  }

  const tenantCount = Number(process.env.SEED_TENANT_COUNT ?? 3);
  const prefix = process.env.SEED_PREFIX ?? 'synthetic';

  const handle = createDb(connectionString, { maxConnections: 1 });
  try {
    const result = await handle.withTransaction((tx) =>
      insertSyntheticSeed(tx, { tenantCount, prefix })
    );
    console.log(
      `Seed complete (env=${appEnv}): ${result.tenantsCreated} tenants created, ` +
        `${result.auditEventsCreated} audit events written. Slugs: ${result.slugs.join(', ')}`
    );
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error('db:seed FAILED:', err);
  process.exit(1);
});
