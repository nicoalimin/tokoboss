/**
 * Synthetic seed generator (UTA-10).
 *
 * - Deterministic: same input produces the same rows (seeded PRNG + fixed
 *   UUIDs), so seeds are reviewable and reproducible.
 * - Synthetic only: names are obviously fake (`Seed Store 001`, SKUs like
 *   `SEED-0001`). Never derived from production data.
 * - Safe: `assertSafeToSeed()` refuses production unconditionally.
 */

export interface SeedStore {
  id: string;
  name: string;
}

export interface SeedProduct {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  priceCents: number;
}

export interface SeedStockMove {
  id: string;
  productId: string;
  qty: number;
  reason: string;
}

export interface SyntheticSeed {
  stores: SeedStore[];
  products: SeedProduct[];
  stockMoves: SeedStockMove[];
}

export interface GenerateSeedOptions {
  storeCount?: number;
  productsPerStore?: number;
}

/** Mulberry32 — tiny deterministic PRNG for reproducible seeds. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic UUID-looking string derived from a numeric sequence. */
export function deterministicUuid(seq: number): string {
  const hex = seq.toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-0000-4000-8000-${'0'.repeat(12 - hex.length)}${hex}`.slice(
    0,
    36
  );
}

const SEED_NAMES = [
  'Seed Store Jakarta',
  'Seed Store Bandung',
  'Seed Store Surabaya',
  'Seed Store Medan',
  'Seed Store Makassar',
];

const PRODUCT_NAMES = [
  'Seed Coffee Beans 250g',
  'Seed Fried Shallots 100g',
  'Seed Batik Pouch',
  'Seed Herbal Tea Box',
  'Seed Coconut Sugar 500g',
  'Seed Sambal Bottle',
];

export function generateSyntheticSeed(
  options: GenerateSeedOptions = {}
): SyntheticSeed {
  const storeCount = options.storeCount ?? 2;
  const productsPerStore = options.productsPerStore ?? 3;
  const rand = mulberry32(0x70_60_80_53);

  const stores: SeedStore[] = [];
  const products: SeedProduct[] = [];
  const stockMoves: SeedStockMove[] = [];

  let seq = 1;
  for (let s = 0; s < storeCount; s += 1) {
    const storeId = deterministicUuid(seq++);
    stores.push({
      id: storeId,
      name: SEED_NAMES[s % SEED_NAMES.length] ?? `Seed Store ${s + 1}`,
    });

    for (let p = 0; p < productsPerStore; p += 1) {
      const productId = deterministicUuid(seq++);
      const priceCents = 10_000 * 100 + Math.floor(rand() * 90_000 * 100);
      products.push({
        id: productId,
        storeId,
        sku: `SEED-${String(s * productsPerStore + p + 1).padStart(4, '0')}`,
        name:
          PRODUCT_NAMES[(s * productsPerStore + p) % PRODUCT_NAMES.length] ??
          `Seed Product ${p + 1}`,
        priceCents,
      });

      const moveId = deterministicUuid(seq++);
      stockMoves.push({
        id: moveId,
        productId,
        qty: 50 + Math.floor(rand() * 100),
        reason: 'seed:opening-balance',
      });
    }
  }

  return { stores, products, stockMoves };
}

/**
 * Refuse to seed production. Production data must never be fabricated or
 * overwritten by automation; this guard has no bypass flag by design —
 * seeding production requires a deliberate, reviewed code change, not a CLI flag.
 */
export function assertSafeToSeed(appEnv: string | undefined): void {
  if (appEnv === 'production') {
    throw new Error(
      'Refusing to seed production. Synthetic seeds are for non-production Neon branches only.'
    );
  }
}

/**
 * Guard against accidental production credentials in tests/seeds.
 * Fails when a URL looks like a production database.
 */
export function assertNoProductionCredentials(
  databaseUrl: string | undefined
): void {
  if (!databaseUrl) {
    return;
  }
  const lowered = databaseUrl.toLowerCase();
  if (lowered.includes('prod')) {
    throw new Error(
      'Refusing to use a production-looking DATABASE_URL in tests or seeds.'
    );
  }
}
