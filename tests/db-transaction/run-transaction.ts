/**
 * Transaction integration test through the DatabasePort (UTA-10).
 *
 * Run: `pnpm --filter @tokoboss/db-transaction-test test`
 *
 * - In-memory section: always runs (no credentials needed).
 * - Live section: runs only when DATABASE_URL targets a non-production
 *   Neon branch; otherwise skipped with a notice.
 */

import type { DatabasePort } from '@tokoboss/domain';
import {
  DrizzleDatabase,
  InMemoryDatabase,
  assertNoProductionCredentials,
  assertSafeToSeed,
  generateSyntheticSeed,
} from '@tokoboss/database';

let passed = 0;

function check(name: string, condition: boolean): void {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

async function expectThrow(
  name: string,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
  } catch {
    passed += 1;
    console.log(`ok: ${name} (threw as expected)`);
    return;
  }
  console.error(`FAIL: ${name} (expected an error, none thrown)`);
  process.exitCode = 1;
}

const STORE_ID = '11111111-0000-4000-8000-000011111111';
const PRODUCT_ID = '22222222-0000-4000-8000-000022222222';
const MOVE_ID = '33333333-0000-4000-8000-000033333333';

/**
 * Core transaction scenarios, adapter-agnostic: every DatabasePort
 * implementation must satisfy these.
 */
async function runPortScenarios(
  db: DatabasePort,
  label: string
): Promise<void> {
  await db.ping();
  check(`${label}: ping succeeds`, true);

  // 1. Commit: all writes in one transaction become visible together.
  await db.withTransaction(async (tx) => {
    await tx.createStore({ id: STORE_ID, name: 'Port Test Store' });
    await tx.createProduct({
      id: PRODUCT_ID,
      storeId: STORE_ID,
      sku: 'PORT-0001',
      name: 'Port Test Product',
      priceCents: 150_000_00,
    });
    await tx.createStockMove({
      id: MOVE_ID,
      productId: PRODUCT_ID,
      qty: 25,
      reason: 'test:opening-balance',
    });
    const inside = await tx.countProducts();
    check(`${label}: commit path sees 1 product inside tx`, inside === 1);
  });

  // 2. Rollback: a throwing transaction leaves no partial state.
  await expectThrow(`${label}: rollback on error`, () =>
    db.withTransaction(async (tx) => {
      await tx.createProduct({
        id: '44444444-0000-4000-8000-000044444444',
        storeId: STORE_ID,
        sku: 'PORT-ROLLBACK',
        name: 'Should Not Persist',
        priceCents: 100,
      });
      throw new Error('simulated failure');
    })
  );

  const afterRollback = await db.withTransaction(async (tx) =>
    tx.countProducts()
  );
  check(`${label}: rollback leaves product count at 1`, afterRollback === 1);

  // 3. FK enforcement: product for an unknown store is rejected.
  await expectThrow(`${label}: rejects product with unknown store`, () =>
    db.withTransaction(async (tx) =>
      tx.createProduct({
        id: '55555555-0000-4000-8000-000055555555',
        storeId: '99999999-0000-4000-8000-000099999999',
        sku: 'PORT-ORPHAN',
        name: 'Orphan',
        priceCents: 100,
      })
    )
  );

  // 4. Uniqueness: duplicate SKU in the same store is rejected.
  await expectThrow(`${label}: rejects duplicate sku in store`, () =>
    db.withTransaction(async (tx) =>
      tx.createProduct({
        id: '66666666-0000-4000-8000-000066666666',
        storeId: STORE_ID,
        sku: 'PORT-0001',
        name: 'Duplicate SKU',
        priceCents: 200,
      })
    )
  );
}

async function main(): Promise<void> {
  // In-memory adapter — always runs, no credentials.
  const memory = new InMemoryDatabase();
  await runPortScenarios(memory, 'in-memory');

  // Seed safety: deterministic, synthetic, production-safe.
  const first = generateSyntheticSeed();
  const second = generateSyntheticSeed();
  check(
    'seed: deterministic across runs',
    JSON.stringify(first) === JSON.stringify(second)
  );
  check(
    'seed: produces stores, products, and stock moves',
    first.stores.length > 0 &&
      first.products.length > 0 &&
      first.stockMoves.length > 0
  );
  const seedJson = JSON.stringify(first);
  check(
    'seed: synthetic markers only (no production data)',
    seedJson.includes('Seed ') &&
      seedJson.includes('SEED-') &&
      !/prod[-_.\s]/i.test(seedJson)
  );
  await expectThrow('seed: refuses production', async () => {
    assertSafeToSeed('production');
  });
  await expectThrow(
    'seed: refuses production-looking credentials',
    async () => {
      assertNoProductionCredentials(
        'postgresql://user:pw@ep-prod-123.aws.neon.tech/db'
      );
    }
  );
  check('seed: allows non-production env', true);
  assertSafeToSeed('preview');

  // Live adapter — opt-in via DATABASE_URL (non-production only).
  const liveUrl = process.env.DATABASE_URL ?? '';
  if (!liveUrl) {
    console.log('skip: live DrizzleDatabase scenarios (DATABASE_URL not set)');
  } else if (
    process.env.APP_ENV === 'production' ||
    liveUrl.toLowerCase().includes('prod')
  ) {
    console.log(
      'skip: live scenarios refused against production-looking target'
    );
  } else {
    const live = new DrizzleDatabase(liveUrl);
    await runPortScenarios(live, 'live-neon');
  }

  if (process.exitCode) {
    console.error('Transaction integration test FAILED.');
  } else {
    console.log(`Transaction integration test passed (${passed} checks).`);
  }
}

main().catch((error) => {
  console.error('Transaction integration test crashed:', error);
  process.exit(1);
});
