import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { SkuMappingDeps, WorkspaceContext } from '@tokoboss/application';
import { drizzle } from 'drizzle-orm/pglite';
import { DrizzleMarketplaceStore } from '../repositories/drizzle-marketplace-store';
import { DrizzleSkuMappingRepository } from '../repositories/drizzle-sku-mapping-repository';
import {
  catalogProducts,
  catalogVariants,
  marketplaceListings,
  schema,
  tenants,
} from '../schema/index';

/** PGlite fixture for drizzle-sku-mapping.test.ts (RFC 05 task 48a). */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
export const NOW = new Date('2026-10-28T06:00:00.000Z');

export async function createMigratedDb() {
  const client = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.exec(sql); // `--> statement-breakpoint` is a SQL comment
  }
  const db = drizzle(client, { schema });
  return { client, db };
}
export type Db = Awaited<ReturnType<typeof createMigratedDb>>['db'];

/** Workspace, Shopee store SHOP-1, SKU-A, suggested staged listing PSKU-1. */
export async function seedSkuMapping(db: Db) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug: 'acme-sku-map' })
    .returning();
  const workspaceId = tenant!.id;
  const connection = await new DrizzleMarketplaceStore(db).connections.upsert({
    workspaceId,
    provider: 'shopee',
    connectMode: 'oauth_redirect',
    shop: {
      providerStoreId: 'SHOP-1',
      providerAccountId: null,
      shopCipher: null,
      storeName: 'Toko Kopi',
      region: 'ID',
    },
    grantedScopes: [],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
    connectedBy: 'user-admin',
    connectedAt: NOW,
  });
  const [product] = await db
    .insert(catalogProducts)
    .values({ workspaceId, name: 'Kaos Polos' })
    .returning();
  const [variant] = await db
    .insert(catalogVariants)
    .values({
      workspaceId,
      productId: product!.id,
      skuCode: 'SKU-A',
      sellingPriceCents: 50_000,
    })
    .returning();
  const [listing] = await db
    .insert(marketplaceListings)
    .values({
      workspaceId,
      connectionId: connection.id,
      externalItemId: 'ITEM-1',
      platformSkuId: 'PSKU-1',
      storeSkuText: 'SKU-A',
      variantName: 'Hitam / L',
      mappingState: 'suggested',
      suggestedVariantIds: [variant!.id],
    })
    .returning();
  const repo = new DrizzleSkuMappingRepository({
    db,
    withTransaction: <T>(fn: (t: never) => Promise<T>): Promise<T> =>
      (db.transaction as (f: (t: never) => Promise<T>) => Promise<T>)(fn),
  });
  const deps: SkuMappingDeps = {
    reads: repo,
    tx: repo,
    audit: { append: async () => undefined },
  };
  const ctx: WorkspaceContext = {
    workspaceId,
    userId: 'user-admin',
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
  const { id: connectionId } = connection;
  const [variantId, listingId] = [variant!.id, listing!.id];
  return { workspaceId, connectionId, variantId, listingId, repo, deps, ctx };
}
