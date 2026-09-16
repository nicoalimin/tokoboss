/**
 * Catalog record vocabulary (UTA-75, Story 01).
 *
 * Plain data records exchanged between `@tokoboss/application` use-cases
 * and `CatalogStore` implementations (Drizzle/Postgres or in-memory).
 * Wire projections (ISO strings) live in `@tokoboss/contracts`.
 */

export const CATALOG_STATUSES = ['active', 'archived'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const WAREHOUSE_STATUSES = ['active', 'deactivated'] as const;
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number];

export function isCatalogStatus(value: unknown): value is CatalogStatus {
  return (
    typeof value === 'string' &&
    (CATALOG_STATUSES as readonly string[]).includes(value)
  );
}

export function isWarehouseStatus(value: unknown): value is WarehouseStatus {
  return (
    typeof value === 'string' &&
    (WAREHOUSE_STATUSES as readonly string[]).includes(value)
  );
}

/** Picture metadata (product-level). Files live in the uploads store. */
export interface ProductPicture {
  fileId: string;
  sortOrder: number;
}

export interface CatalogProductRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  unit: string;
  pictures: ProductPicture[];
  status: CatalogStatus;
  /** Bumped on every update; PATCH callers must echo it back. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One sellable variant = one SKU TokoBoss code (unique per workspace). */
export interface CatalogVariantRecord {
  id: string;
  workspaceId: string;
  productId: string;
  skuCode: string;
  /** Variant label (e.g. size/colour). Null = single-variant product. */
  name: string | null;
  barcode: string | null;
  sellingPriceCents: number;
  currency: string;
  /** Manual HPP (deep HPP is a later Story). */
  hppCents: number | null;
  /** Free-form cost-source label (e.g. `manual`). */
  costSource: string | null;
  /** Marketplace listing-name hint (searchable). */
  listingName: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Workspace-scoped warehouse master data (opaque to tenancy scopes). */
export interface WarehouseRecord {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  status: WarehouseStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SoT read model for on-hand qty per (variant, warehouse).
 * Derived ONLY from `StockLedgerRecord` entries — never edited directly.
 */
export interface InventoryLevelRecord {
  id: string;
  workspaceId: string;
  variantId: string;
  warehouseId: string;
  qty: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Append-only stock ledger — the stock source of truth. */
export interface StockLedgerRecord {
  id: string;
  workspaceId: string;
  variantId: string;
  warehouseId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  /** Opaque actor user id. Never email/name. */
  actorId: string | null;
  correlationId: string | null;
  createdAt: Date;
}

/**
 * Store SKU mapping (stub-ready, Story 03–04).
 * `(channel, shop_ext_id, platform_sku_id)` → SKU TokoBoss.
 * `sellerSkuHint` / `barcodeHint` are search hints only, never keys.
 * No live marketplace calls touch this table in Story 01.
 */
export interface ChannelMappingRecord {
  id: string;
  workspaceId: string;
  variantId: string;
  channel: string;
  shopExtId: string;
  platformSkuId: string;
  sellerSkuHint: string | null;
  barcodeHint: string | null;
  listingName: string | null;
  createdAt: Date;
}

export interface NewVariantInput {
  skuCode: string;
  name?: string | null;
  barcode?: string | null;
  sellingPriceCents: number;
  currency?: string;
  hppCents?: number | null;
  costSource?: string | null;
  listingName?: string | null;
}
