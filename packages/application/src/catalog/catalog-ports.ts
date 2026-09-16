import type {
  CatalogProductRecord,
  CatalogStatus,
  CatalogVariantRecord,
  ChannelMappingRecord,
  InventoryLevelRecord,
  NewVariantInput,
  ProductPicture,
  StockLedgerRecord,
  StockSettingsRecord,
  WarehouseRecord,
  WarehouseStatus,
} from './catalog-types';
import type {
  BundleLineRecord,
  NewBundleLineInput,
} from '../bundles/bundle-types';

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
 *
 * Caller contract: composite inputs (`createVariant`'s `productId`,
 * `adjustLevel`'s `variantId`/`warehouseId`) must already be resolved
 * inside `workspaceId` — the use-cases verify this with scoped finds
 * before calling. Stores re-check on read-modify-write paths but do not
 * re-resolve foreign rows.
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

  /**
   * Atomic cascade archive: compare-and-set the product to `archived`
   * (throwing `CATALOG_VERSION_CONFLICT` on a stale `expectedVersion`)
   * plus every active variant, in one unit of work. Idempotent — an
   * already-archived product returns as-is.
   */
  archiveProductCascade(
    workspaceId: string,
    productId: string,
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
   * Atomic unit of work: idempotency check, expected-version check,
   * compute `balanceAfter = current + delta` (rejecting oversell unless
   * `allowNegative`), append the ledger entry, and advance the level row
   * (created on first adjustment). Throws `CATALOG_VERSION_CONFLICT` /
   * `CATALOG_INSUFFICIENT_STOCK` / `CATALOG_CONFLICT` (idempotency-key
   * reuse with a different payload).
   *
   * When `idempotencyKey` is present and already recorded for the
   * workspace, the original `{ level, entry }` is returned without
   * applying the delta again; a key reused with a different
   * variant/warehouse/delta/reason throws `CATALOG_CONFLICT`.
   */
  adjustLevel(input: {
    workspaceId: string;
    variantId: string;
    warehouseId: string;
    delta: number;
    reason: string;
    actorId: string | null;
    correlationId?: string;
    idempotencyKey?: string;
    allowNegative?: boolean;
    expectedVersion?: number;
  }): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord }>;

  /**
   * Resolve a previous adjustment by idempotency key (null when unseen).
   * Scoped to the workspace so keys never leak across tenants.
   */
  findLedgerEntryByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord } | null>;

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
    limit: number,
    filters?: { warehouseId?: string }
  ): Promise<StockLedgerRecord[]>;

  countMovements(workspaceId: string, variantId: string): Promise<number>;

  // Stock policy (UTA-81, Story 05)

  /**
   * Per-workspace stock policy. Implementations create the default
   * (`allowNegative: false`) lazily on first read so fresh workspaces
   * need no backfill.
   */
  getStockSettings(workspaceId: string): Promise<StockSettingsRecord>;

  /**
   * Toggle the negative-stock policy (Admin-only at the use-case layer).
   * Compare-and-set on `expectedVersion`; stale writes throw
   * `CATALOG_VERSION_CONFLICT` with `currentVersion`.
   */
  updateStockSettings(
    workspaceId: string,
    patch: { allowNegative: boolean },
    expectedVersion: number
  ): Promise<StockSettingsRecord>;

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

  // Bundle BOM (UTA-79, Story 13)
  //
  // A bundle is a variant whose BOM is the set of lines where it is the
  // `bundleVariantId`. A variant with ≥1 lines is a bundle; a variant with
  // none is a plain component SKU. All methods are workspace-scoped like
  // the rest of the port.
  //
  // `replaceBundleLines` / `clearBundleLines` are atomic units of work:
  // they check `expectedVersion` against the bundle variant's version
  // (409 `BUNDLE_VERSION_CONFLICT` with `currentVersion` on stale writes)
  // and bump the bundle variant's version alongside the line changes, so
  // concurrent BOM edits never silently overwrite each other.

  /**
   * Replace the full BOM of a bundle variant (empty array clears it).
   * Returns the stored lines plus the bumped bundle variant version.
   */
  replaceBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    lines: NewBundleLineInput[],
    expectedVersion: number
  ): Promise<{ lines: BundleLineRecord[]; bundleVersion: number }>;

  /** Remove every BOM line of a bundle variant (archive path). */
  clearBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    expectedVersion: number
  ): Promise<{ bundleVersion: number }>;

  listBundleLines(
    workspaceId: string,
    bundleVariantId: string
  ): Promise<BundleLineRecord[]>;

  listBundlesByWorkspace(workspaceId: string): Promise<BundleLineRecord[]>;

  /** Every BOM line that consumes `componentVariantId`. */
  listBundlesUsingComponent(
    workspaceId: string,
    componentVariantId: string
  ): Promise<BundleLineRecord[]>;

  /** True when the variant holds ≥1 BOM lines (i.e. it is a bundle). */
  isBundleVariant(workspaceId: string, variantId: string): Promise<boolean>;
}
