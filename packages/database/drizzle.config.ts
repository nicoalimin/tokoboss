import { defineConfig } from 'drizzle-kit';

/**
 * Single Drizzle Kit configuration for the monorepo.
 * - `schema` lives with the adapter (`packages/database/src/schema`).
 * - Generated SQL is committed under `infra/drizzle` (review → test → migrate).
 * - Never use `drizzle-kit push` for staging/production.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: '../../infra/drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});
