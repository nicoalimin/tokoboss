/**
 * Controlled migration runner (UTA-10).
 *
 * - Non-production (`pnpm db:migrate`): applies committed SQL from
 *   `infra/drizzle` to `DATABASE_URL`. Re-running is safe — drizzle records
 *   applied migrations in `__drizzle_migrations` and skips them.
 * - Production (`pnpm db:migrate:prod` / `--prod`): single controlled step
 *   guarded by a session-level Postgres advisory lock so concurrent runners
 *   serialize instead of racing.
 *
 * Never logs credentials. Never uses `db push`.
 *
 * Required env: `DATABASE_URL` (non-prod may be a Neon branch URL).
 * Prod additionally requires `MIGRATE_PROD_CONFIRM=1`.
 */
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const MIGRATIONS_FOLDER = new URL('../../../../infra/drizzle', import.meta.url).pathname;
/** Session advisory-lock key for production migrations (arbitrary stable int). */
const PROD_ADVISORY_LOCK_KEY = 74107210;

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '<unparsable-url>';
  }
}

async function main(): Promise<void> {
  const isProd = process.argv.includes('--prod');
  const connectionString = process.env.DATABASE_URL ?? '';

  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set. Refusing to migrate without an explicit target.');
    process.exit(1);
  }

  if (isProd && process.env.MIGRATE_PROD_CONFIRM !== '1') {
    console.error(
      '❌ Production migrate requires MIGRATE_PROD_CONFIRM=1. ' +
        'Run non-prod migrate first against a staging/branch database.'
    );
    process.exit(1);
  }

  console.log(`🔄 Migrating ${redactUrl(connectionString)}${isProd ? ' (PRODUCTION, locked)' : ''}...`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (isProd) {
      await client.query('select pg_advisory_lock($1)', [PROD_ADVISORY_LOCK_KEY]);
      console.log('🔒 Acquired production migration advisory lock.');
    }

    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const applied = await client.query(
      'select id, hash, created_at from "__drizzle_migrations" order by created_at'
    );
    console.log(
      `✅ Migrate complete: ${applied.rowCount} migration(s) recorded, no pending work.`
    );
  } finally {
    if (isProd) {
      await client.query('select pg_advisory_unlock($1)', [PROD_ADVISORY_LOCK_KEY]);
      console.log('🔓 Released production migration advisory lock.');
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
