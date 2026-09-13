#!/usr/bin/env tsx
/**
 * Synthetic seed runner — non-production only.
 *
 * Usage:
 *   pnpm --filter @tokoboss/database db:seed            # seeds DATABASE_URL
 *   pnpm --filter @tokoboss/database db:seed:dry-run    # prints without writing
 *
 * - `--dry-run` prints the deterministic seed as JSON (no DB needed).
 * - Without `--dry-run`, inserts the seed via the Drizzle adapter.
 * - Always refuses production (`assertSafeToSeed` has no bypass).
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema/index.js';
import {
  assertNoProductionCredentials,
  assertSafeToSeed,
  generateSyntheticSeed,
} from '../seed/synthetic-seed.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const appEnv = process.env.APP_ENV;

  assertSafeToSeed(appEnv);

  const seed = generateSyntheticSeed();
  if (dryRun) {
    console.log(JSON.stringify(seed, null, 2));
    return;
  }

  const databaseUrl =
    process.env.DATABASE_URL ?? process.env.DATABASE_POOL_URL ?? '';
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (or DATABASE_POOL_URL). Aborting.');
    process.exit(1);
  }
  assertNoProductionCredentials(databaseUrl);

  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  for (const store of seed.stores) {
    await db.insert(schema.stores).values(store).onConflictDoNothing();
  }
  for (const product of seed.products) {
    await db
      .insert(schema.products)
      .values({
        id: product.id,
        storeId: product.storeId,
        sku: product.sku,
        name: product.name,
        priceCents: product.priceCents,
      })
      .onConflictDoNothing();
  }
  for (const move of seed.stockMoves) {
    await db
      .insert(schema.stockMoves)
      .values({
        id: move.id,
        productId: move.productId,
        qty: move.qty,
        reason: move.reason,
      })
      .onConflictDoNothing();
  }

  console.log(
    `Seeded ${seed.stores.length} store(s), ${seed.products.length} product(s), ` +
      `${seed.stockMoves.length} stock move(s).`
  );
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
