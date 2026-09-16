import type {
  CatalogProductRecord,
  CatalogStatus,
  CatalogVariantRecord,
  ChannelMappingRecord,
  InventoryLevelRecord,
  NewVariantInput,
  ProductPicture,
  StockLedgerRecord,
  WarehouseRecord,
  WarehouseStatus,
} from './catalog-types';

/**
 * Persistence port for the catalog (UTA-75, Story 01).
 *
 * Implementations:
 * - `DrizzleCatalogStore` (`@tokoboss/database`) — Postgres/Neon + PGlite tests.
 * - `InMemoryCatalogStore` (here) — unit tests and memory-mode web wiring.
 *
 * Every method is workspace-scoped: the `workspaceId` argument is the
 * isolation boundary and cross-workspace misses surface as null (use-cases
 * map them to `catalogNotFound`, indistinguishable from not-found).
 *
 * Optimistic concurrency: `update*` and `adjustLevel` take an
 * `expectedVersion` and throw `CATALOG_VERSION_CONFLICT` (with
 * `currentVersion` in details) instead of silently overwriting.
 * Uniqueness violations throw `CATALOG_CONFLICT` with the existing row's
 * path in details.
 */
export interface CatalogStore {
  // Products

  /**
   * Atomic unit of work: insert the product plus all of its variants.
   * Uniqueness violations throw `CATALOG_CONFLICT` with the existing row's
   * path in details; nothing is persisted on conflict.
   */
  createProductWithVariants(input: {
    workspaceId: string;
    name: string;
    description: string | null;
    unit: string;
    pictures: ProductPicture[];
    variants: NewVariantInput[];
  }): Promise<{
    product: CatalogProductRecord;
    variants: CatalogVariantRecord[];
  }>;

  findProductById(
    workspaceId: string,
    productId: string
  ): Promise<CatalogProductRecord | null>;

  listProducts(workspaceId: string): Promise<CatalogProductRecord[]>;

  updateProduct(
    workspaceId: string,
    productId: string,
    patch: {
      name?: string;
      description?: string | null;
      unit?: string;
      pictures?: ProductPicture[];
      status?: CatalogStatus;
    },
    expectedVersion: number
  ): Promise<CatalogProductRecord>;

  // Variants (SKU TokoBoss)

  createVariant(
    workspaceId: string,
    productId: string,
    input: NewVariantInput
  ): Promise<CatalogVariantRecord>;

  findVariantById(
    workspaceId: string,
    variantId: string
  ): Promise<CatalogVariantRecord | null>;

  findVariantBySku(
    workspaceId: string,
    skuCode: string
  ): Promise<CatalogVariantRecord | null>;

  listVariantsByProduct(
    workspaceId: string,
    productId: string
  ): Promise<CatalogVariantRecord[]>;

  listVariantsByWorkspace(workspaceId: string): Promise<CatalogVariantRecord[]>;

  updateVariant(
    workspaceId: string,
    variantId: string,
    patch: {
      skuCode?: string;
      name?: string | null;
      barcode?: string | null;
      sellingPriceCents?: number;
      currency?: string;
      hppCents?: number | null;
      costSource?: string | null;
      listingName?: string | null;
      status?: CatalogStatus;
    },
    expectedVersion: number
  ): Promise<CatalogVariantRecord>;

  // Warehouses

  createWarehouse(input: {
    workspaceId: string;
    code: string;
    name: string;
  }): Promise<WarehouseRecord>;

  findWarehouseById(
    workspaceId: string,
    warehouseId: string
  ): Promise<WarehouseRecord | null>;

  listWarehouses(workspaceId: string): Promise<WarehouseRecord[]>;

  updateWarehouse(
    workspaceId: string,
    warehouseId: string,
    patch: { name?: string; status?: WarehouseStatus },
    expectedVersion: number
  ): Promise<WarehouseRecord>;

  // Stock (ledger SoT + level read model)

  /**
   * Atomic unit of work: validate expected version, compute
   * `balanceAfter = current + delta`, append the ledger entry, and advance
   * the level row (created on first adjustment). Throws
   * `CATALOG_VERSION_CONFLICT` / `CATALOG_INSUFFICIENT_STOCK`.
   */
  adjustLevel(input: {
    workspaceId: string;
    variantId: string;
    warehouseId: string;
    delta: number;
    balanceCheck?: { currentQty: number };
    reason: string;
    actorId: string | null;
    correlationId?: string;
    expectedVersion?: number;
  }): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord }>;

  getLevel(
    workspaceId: string,
    variantId: string,
    warehouseId: string
  ): Promise<InventoryLevelRecord | null>;

  listLevelsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<InventoryLevelRecord[]>;

  listLedgerByVariant(
    workspaceId: string,
    variantId: string,
    limit: number
  ): Promise<StockLedgerRecord[]>;

  countMovements(workspaceId: string, variantId: string): Promise<number>;

  // Channel mappings (stub-ready)

  createMapping(input: {
    workspaceId: string;
    variantId: string;
    channel: string;
    shopExtId: string;
    platformSkuId: string;
    sellerSkuHint: string | null;
    barcodeHint: string | null;
    listingName: string | null;
  }): Promise<ChannelMappingRecord>;

  listMappingsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<ChannelMappingRecord[]>;

  listMappingsByWorkspace(workspaceId: string): Promise<ChannelMappingRecord[]>;

  countMappings(workspaceId: string, variantId: string): Promise<number>;

  deleteMapping(workspaceId: string, mappingId: string): Promise<void>;
}
