/**
 * `pnpm db:migrate:prod` — single controlled production migration step.
 *
 * - Requires APP_ENV=production (fail fast otherwise).
 * - Requires DATABASE_URL to be set explicitly (never inferred).
 * - Uses ONE migrator invocation with a Postgres advisory lock so
 *   concurrent deploys serialize instead of racing.
 * - Never generates SQL, never pushes schema, never seeds.
 */
import {
  defaultMigrationsFolder,
  formatMigrationStatus,
  runMigrations,
} from '../src/migrate.js';

async function main(): Promise<void> {
  const appEnv = process.env.APP_ENV;
  if (appEnv !== 'production') {
    console.error(
      `Refusing production migrate: APP_ENV=${appEnv ?? '(unset)'} (must be "production").`
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Refusing to migrate production without an explicit target.'
    );
    process.exit(1);
  }

  if (process.env.ALLOW_PROD_MIGRATE !== 'true') {
    console.error(
      'Refusing production migrate: set ALLOW_PROD_MIGRATE=true to confirm this controlled step.'
    );
    process.exit(1);
  }

  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_FOLDER ?? defaultMigrationsFolder();

  // Single controlled step: one call, advisory lock held inside runMigrations.
  const status = await runMigrations(connectionString, {
    migrationsFolder,
    useAdvisoryLock: true,
  });
  console.log(`[prod migrate] ${formatMigrationStatus(status)}`);
  if (status.pending.length > 0) {
    console.error('[prod migrate] Migration did not converge. Failing deploy.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('db:migrate:prod FAILED:', err);
  process.exit(1);
});
