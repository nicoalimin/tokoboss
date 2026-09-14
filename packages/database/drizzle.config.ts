import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle-kit configuration (UTA-10).
 *
 * - `schema` is the single source of truth under `packages/database`.
 * - `out` is the committed migration history under `infra/drizzle`.
 *   `out` resolves relative to the cwd the command runs from, so all
 *   `db:*` scripts must run with cwd `packages/database`.
 * - Staging/production NEVER use `db push` — only reviewed, committed SQL
 *   applied via `db:migrate` / `db:migrate:prod`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: '../../infra/drizzle',
});
