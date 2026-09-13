#!/usr/bin/env tsx
/**
 * Controlled migration runner — the ONLY way to migrate staging/production.
 *
 * Usage:
 *   pnpm --filter @tokoboss/database db:migrate                 # non-prod
 *   pnpm --filter @tokoboss/database db:migrate:prod            # production (explicit)
 *
 * Guarantees (UTA-10):
 * - Single controlled step: one `migrateWithAdvisoryLock()` invocation.
 * - Advisory lock: concurrent migrators serialize on a Postgres lock key.
 * - Production guard: refuses production unless `--allow-production` is
 *   passed AND `APP_ENV=production`. Never runs against a production-looking
 *   URL by accident (warns loudly).
 * - Idempotent: re-running with nothing pending reports "no pending work".
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateWithAdvisoryLock } from '../db/migrate.js';

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/drizzle'
);

function parseArgs(argv: string[]): { allowProduction: boolean } {
  return { allowProduction: argv.includes('--allow-production') };
}

function looksLikeProductionUrl(url: string): boolean {
  return url.toLowerCase().includes('prod');
}

async function main(): Promise<void> {
  const { allowProduction } = parseArgs(process.argv.slice(2));
  const appEnv = process.env.APP_ENV;
  const databaseUrl =
    process.env.DATABASE_URL ?? process.env.DATABASE_POOL_URL ?? '';

  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (or DATABASE_POOL_URL). Aborting.');
    process.exit(1);
  }

  const isProduction =
    appEnv === 'production' || looksLikeProductionUrl(databaseUrl);
  if (isProduction && !allowProduction) {
    console.error(
      'Refusing to migrate a production-looking database without --allow-production.\n' +
        'Run `db:migrate:prod` deliberately from a controlled release step.'
    );
    process.exit(1);
  }
  if (isProduction && appEnv !== 'production') {
    console.error(
      `Refusing: URL looks like production but APP_ENV=${appEnv ?? '(unset)'}. ` +
        'Set APP_ENV=production for the controlled production step.'
    );
    process.exit(1);
  }

  console.log(`Applying migrations from ${MIGRATIONS_FOLDER} ...`);
  const result = await migrateWithAdvisoryLock({
    databaseUrl,
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  if (result.alreadyUpToDate) {
    console.log('No pending work: database is already up to date.');
  } else {
    console.log(`Applied ${result.appliedCount} migration(s).`);
  }
}

main().catch((error) => {
  console.error(
    'Migration failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
