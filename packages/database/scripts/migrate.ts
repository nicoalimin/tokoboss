/**
 * `pnpm db:migrate` — apply pending migrations with an advisory lock,
 * then report status. Safe to re-run (idempotent).
 */
import {
  defaultMigrationsFolder,
  formatMigrationStatus,
  runMigrations,
} from '../src/migrate.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_FOLDER ?? defaultMigrationsFolder();

  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Refusing to migrate without an explicit target.'
    );
    process.exit(1);
  }

  const status = await runMigrations(connectionString, { migrationsFolder });
  console.log(formatMigrationStatus(status));
  if (status.pending.length > 0) {
    console.error('Expected no pending work after migrate. Failing.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('db:migrate FAILED:', err);
  process.exit(1);
});
