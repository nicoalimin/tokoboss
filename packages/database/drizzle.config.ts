import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration — single source of truth for schema generation.
 *
 * - `schema`: TypeScript table definitions under `packages/database/src/schema`.
 * - `out`: committed generated SQL under `infra/drizzle` (reviewed, never pushed).
 *
 * Pipeline (UTA-10): generate → review → test → migrate.
 * Do NOT use `drizzle-kit push` for staging or production.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: '../../infra/drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});
