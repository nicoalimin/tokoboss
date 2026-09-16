import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, utcTimestamps, uuidPk } from './helpers';
import type { ProductPicture } from '@tokoboss/application';

/**
 * Catalog domain tables (UTA-75, Story 01).
 *
 * Tenancy: every row carries `workspace_id → tenants.id` (a workspace IS
 * the tenant boundary, same as `jobs` / `workspace_members`). All reads
 * and writes are workspace-scoped in `DrizzleCatalogStore`.
 *
 * - `catalog_products` → `catalog_variants`: one product, ≥1 variants.
 *   Each variant owns one SKU TokoBoss code, unique per workspace.
 * - `catalog_warehouses`: workspace-scoped warehouse master data with an
 *   `active | deactivated` status (adjustments into deactivated warehouses
 *   are rejected instead of silently applied).
 * - `catalog_inventory_levels`: SoT read model for on-hand qty, derived
 *   ONLY from `catalog_stock_ledger` entries (never edited directly).
 * - `catalog_stock_ledger`: append-only stock source of truth.
 * - `catalog_channel_mappings`: `(channel, shop_ext_id, platform_sku_id)`
 *   → SKU TokoBoss. Stub-ready for Story 03–04; no live marketplace calls
 *   touch this table in Story 01.
 *
 * Removal is archive-only (`status = 'archived'`); there is deliberately
 * no delete path in the store.
 */
export const catalogProducts = pgTable(
  'catalog_products',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('pcs'),
    pictures: jsonb('pictures').$type<ProductPicture[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [index('catalog_products_workspace_idx').on(t.workspaceId)]
);

export const catalogVariants = pgTable(
  'catalog_variants',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => catalogProducts.id, { onDelete: 'cascade' }),
    skuCode: text('sku_code').notNull(),
    name: text('name'),
    barcode: text('barcode'),
    sellingPriceCents: integer('selling_price_cents').notNull(),
    currency: text('currency').notNull().default('IDR'),
    hppCents: integer('hpp_cents'),
    costSource: text('cost_source'),
    listingName: text('listing_name'),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_variants_workspace_sku_unique').on(
      t.workspaceId,
      t.skuCode
    ),
    index('catalog_variants_workspace_product_idx').on(
      t.workspaceId,
      t.productId
    ),
    index('catalog_variants_workspace_barcode_idx').on(
      t.workspaceId,
      t.barcode
    ),
  ]
);

export const catalogWarehouses = pgTable(
  'catalog_warehouses',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_warehouses_workspace_code_unique').on(
      t.workspaceId,
      t.code
    ),
    index('catalog_warehouses_workspace_idx').on(t.workspaceId),
  ]
);

export const catalogInventoryLevels = pgTable(
  'catalog_inventory_levels',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    qty: integer('qty').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_levels_variant_warehouse_unique').on(
      t.variantId,
      t.warehouseId
    ),
    index('catalog_levels_workspace_variant_idx').on(
      t.workspaceId,
      t.variantId
    ),
  ]
);

export const catalogStockLedger = pgTable(
  'catalog_stock_ledger',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id'),
    correlationId: text('correlation_id'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('catalog_ledger_variant_warehouse_created_idx').on(
      t.variantId,
      t.warehouseId,
      t.createdAt
    ),
    index('catalog_ledger_workspace_variant_idx').on(
      t.workspaceId,
      t.variantId
    ),
  ]
);

export const catalogChannelMappings = pgTable(
  'catalog_channel_mappings',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    shopExtId: text('shop_ext_id').notNull(),
    platformSkuId: text('platform_sku_id').notNull(),
    sellerSkuHint: text('seller_sku_hint'),
    barcodeHint: text('barcode_hint'),
    listingName: text('listing_name'),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_mappings_workspace_channel_shop_platform_unique').on(
      t.workspaceId,
      t.channel,
      t.shopExtId,
      t.platformSkuId
    ),
    index('catalog_mappings_workspace_variant_idx').on(
      t.workspaceId,
      t.variantId
    ),
  ]
);

export type CatalogProductRow = typeof catalogProducts.$inferSelect;
export type NewCatalogProductRow = typeof catalogProducts.$inferInsert;
export type CatalogVariantRow = typeof catalogVariants.$inferSelect;
export type NewCatalogVariantRow = typeof catalogVariants.$inferInsert;
export type CatalogWarehouseRow = typeof catalogWarehouses.$inferSelect;
export type NewCatalogWarehouseRow = typeof catalogWarehouses.$inferInsert;
export type CatalogInventoryLevelRow =
  typeof catalogInventoryLevels.$inferSelect;
export type CatalogStockLedgerRow = typeof catalogStockLedger.$inferSelect;
export type CatalogChannelMappingRow =
  typeof catalogChannelMappings.$inferSelect;
