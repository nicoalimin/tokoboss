import { BusinessRuleViolationError, CatalogRules } from '@tokoboss/domain';
import {
  catalogConflict,
  catalogInsufficientStock,
  catalogNotFound,
  catalogValidation,
  catalogVersionConflict,
  isCatalogStatus,
  isRecommendationStateStatus,
  isWarehouseStatus,
} from '@tokoboss/application';
import type {
  BundleLineRecord,
  NewBundleLineInput,
} from '@tokoboss/application';
import { bundleConflict, bundleVersionConflict } from '@tokoboss/application';
import type {
  CatalogProductRecord,
  CatalogRecommendationStateRecord,
  RecommendationStateStatus,
  CatalogStatus,
  CatalogStore,
  CatalogVariantRecord,
  ChannelMappingRecord,
  InventoryLevelRecord,
  NewVariantInput,
  ProductPicture,
  StockLedgerRecord,
  StockSettingsRecord,
  TransferItemRecord,
  TransferRecord,
  TransferStore,
  TransferWithItems,
  WarehouseRecord,
  WarehouseStatus,
} from '@tokoboss/application';
import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogBundleLines,
  catalogChannelMappings,
  catalogInventoryLevels,
  catalogProducts,
  catalogRecommendationStates,
  catalogStockLedger,
  catalogStockSettings,
  catalogTransferItems,
  catalogTransfers,
  catalogVariants,
  catalogWarehouses,
} from '../schema/index';
import type {
  CatalogBundleLineRow,
  CatalogChannelMappingRow,
  CatalogInventoryLevelRow,
  CatalogProductRow,
  CatalogRecommendationStateRow,
  CatalogStockLedgerRow,
  CatalogStockSettingsRow,
  CatalogTransferItemRow,
  CatalogVariantRow,
  CatalogWarehouseRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

function variantPath(workspaceId: string, v: CatalogVariantRecord): string {
  return `/api/workspaces/${workspaceId}/catalog/products/${v.productId}/variants/${v.id}`;
}

function toProduct(row: CatalogProductRow): CatalogProductRecord {
  if (!isCatalogStatus(row.status)) {
    throw new Error(`CATALOG_CORRUPT: unknown product status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    unit: row.unit,
    pictures: (row.pictures ?? []) as ProductPicture[],
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toVariant(row: CatalogVariantRow): CatalogVariantRecord {
  if (!isCatalogStatus(row.status)) {
    throw new Error(`CATALOG_CORRUPT: unknown variant status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    productId: row.productId,
    skuCode: row.skuCode,
    name: row.name,
    barcode: row.barcode,
    sellingPriceCents: row.sellingPriceCents,
    currency: row.currency,
    hppCents: row.hppCents,
    costSource: row.costSource,
    minStockQty: row.minStockQty,
    leadTimeDays: row.leadTimeDays,
    listingName: row.listingName,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWarehouse(row: CatalogWarehouseRow): WarehouseRecord {
  if (!isWarehouseStatus(row.status)) {
    throw new Error(`CATALOG_CORRUPT: unknown warehouse status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    code: row.code,
    name: row.name,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLevel(row: CatalogInventoryLevelRow): InventoryLevelRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    qty: row.qty,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLedgerEntry(row: CatalogStockLedgerRow): StockLedgerRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    actorId: row.actorId,
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

function toStockSettings(row: CatalogStockSettingsRow): StockSettingsRecord {
  return {
    workspaceId: row.workspaceId,
    allowNegative: row.allowNegative,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMapping(row: CatalogChannelMappingRow): ChannelMappingRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    channel: row.channel,
    shopExtId: row.shopExtId,
    platformSkuId: row.platformSkuId,
    sellerSkuHint: row.sellerSkuHint,
    barcodeHint: row.barcodeHint,
    listingName: row.listingName,
    createdAt: row.createdAt,
  };
}

function toBundleLine(row: CatalogBundleLineRow): BundleLineRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bundleVariantId: row.bundleVariantId,
    componentVariantId: row.componentVariantId,
    qty: row.qty,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRecommendationState(
  row: CatalogRecommendationStateRow
): CatalogRecommendationStateRecord {
  if (!isRecommendationStateStatus(row.status)) {
    throw new Error(
      `CATALOG_CORRUPT: unknown recommendation state status ${row.status}`
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    status: row.status,
    snoozedUntil: row.snoozedUntil,
    suggestedReorderQtyOverride: row.suggestedReorderQtyOverride,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTransfer(row: typeof catalogTransfers.$inferSelect): TransferRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    referenceNum: row.referenceNum,
    sourceWarehouseId: row.sourceWarehouseId,
    destWarehouseId: row.destWarehouseId,
    status: row.status as TransferRecord['status'],
    notes: row.notes ?? null,
    expectedReceiveDate: row.expectedReceiveDate ?? null,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function extractSkuFromUniqueDetail(err: unknown): string | null {
  // postgres.js exposes the server `detail` on the driver error; drizzle
  // wraps it as `cause` (PGlite mirrors the shape). Format:
  // `Key (workspace_id, sku_code)=(…, CODE) already exists.`
  const containers = [err, (err as { cause?: unknown } | null)?.cause ?? null];
  for (const container of containers) {
    if (typeof container !== 'object' || container === null) continue;
    const detail = (container as { detail?: unknown }).detail;
    if (typeof detail !== 'string') continue;
    const match = detail.match(/sku_code\)=\([^,]+,\s*([^)]+)\)/);
    const sku = match?.[1]?.trim();
    if (sku) return sku;
  }
  return null;
}

function toTransferItem(item: CatalogTransferItemRow): TransferItemRecord {
  return {
    id: item.id,
    transferId: item.transferId,
    workspaceId: item.workspaceId,
    variantId: item.variantId,
    requestedQty: item.requestedQty,
    sentQty: item.sentQty,
    receivedQty: item.receivedQty,
    damagedQty: item.damagedQty,
    cancellationReason: item.cancellationReason ?? null,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const top = (err as { code?: unknown }).code;
  if (top === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Postgres-backed `CatalogStore` (Neon via `createDb`, PGlite in tests).
 *
 * Workspace scoping on every query; compare-and-set `version` checks on
 * every update (409 `CATALOG_VERSION_CONFLICT` with `currentVersion`
 * instead of silent overwrites); unique violations mapped to 409
 * `CATALOG_CONFLICT` with the existing row's path. Composite writes
 * (product + variants, ledger + level) run inside one transaction.
 */
export class DrizzleCatalogStore implements CatalogStore, TransferStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleCatalogStore {
    return new DrizzleCatalogStore(tx);
  }

  // Products

  async createProductWithVariants(input: {
    workspaceId: string;
    name: string;
    description: string | null;
    unit: string;
    pictures: ProductPicture[];
    variants: NewVariantInput[];
  }): Promise<{
    product: CatalogProductRecord;
    variants: CatalogVariantRecord[];
  }> {
    const run = async (tx: DbOrTx) => {
      const insertedProducts = await tx
        .insert(catalogProducts)
        .values({
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          unit: input.unit,
          pictures: input.pictures,
        })
        .returning();
      const productRow = insertedProducts[0];
      if (!productRow) throw new Error('Failed to insert catalog product');
      const createdVariants: CatalogVariantRecord[] = [];
      for (const v of input.variants) {
        const inserted = await tx
          .insert(catalogVariants)
          .values({
            workspaceId: input.workspaceId,
            productId: productRow.id,
            skuCode: v.skuCode,
            name: v.name ?? null,
            barcode: v.barcode ?? null,
            sellingPriceCents: v.sellingPriceCents,
            currency: (v.currency ?? 'IDR').toUpperCase(),
            hppCents: v.hppCents ?? null,
            costSource: v.costSource ?? null,
            minStockQty: null,
            leadTimeDays: null,
            listingName: v.listingName ?? null,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to insert catalog variant');
        createdVariants.push(toVariant(row));
      }
      return { product: toProduct(productRow), variants: createdVariants };
    };
    try {
      return await this.inTx(run);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // The failed statement aborted the transaction, so the existing row
      // is resolved AFTER rollback on the root handle (a lookup inside the
      // aborted tx would fail with 25P02).
      const attempted = input.variants.map((v) => v.skuCode);
      const clash =
        extractSkuFromUniqueDetail(err) !== null &&
        attempted.includes(extractSkuFromUniqueDetail(err) as string)
          ? (extractSkuFromUniqueDetail(err) as string)
          : null;
      const candidates = clash ? [clash] : attempted;
      for (const sku of candidates) {
        const existing = await this.findVariantBySku(input.workspaceId, sku);
        if (existing) {
          throw catalogConflict(
            `SKU code ${existing.skuCode} is already in use.`,
            {
              existingPath: variantPath(input.workspaceId, existing),
              existingVariantId: existing.id,
              existingProductId: existing.productId,
            }
          );
        }
      }
      throw catalogConflict('SKU code is already in use.');
    }
  }

  /**
   * Run `fn` inside a transaction when holding the root handle; run it
   * directly when already bound to a transaction (nested `transaction()`
   * calls are rejected by the driver).
   */
  private inTx<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    const handle = this.db as {
      transaction?: (fn: (tx: Transaction) => Promise<T>) => Promise<T>;
    };
    if (typeof handle.transaction === 'function') {
      return handle.transaction((tx) => fn(tx));
    }
    return fn(this.db);
  }

  /** True when holding the root handle (post-rollback reads are possible). */
  private isRootHandle(): boolean {
    return (
      typeof (this.db as { transaction?: unknown }).transaction === 'function'
    );
  }

  async findProductById(
    workspaceId: string,
    productId: string
  ): Promise<CatalogProductRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogProducts)
      .where(
        and(
          eq(catalogProducts.id, productId),
          eq(catalogProducts.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toProduct(row) : null;
  }

  async listProducts(workspaceId: string): Promise<CatalogProductRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogProducts)
      .where(eq(catalogProducts.workspaceId, workspaceId));
    return rows.map(toProduct);
  }

  async updateProduct(
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
  ): Promise<CatalogProductRecord> {
    const updated = await this.db
      .update(catalogProducts)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(catalogProducts.id, productId),
          eq(catalogProducts.workspaceId, workspaceId),
          eq(catalogProducts.version, expectedVersion)
        )
      )
      .returning();
    const row = updated[0];
    if (row) return toProduct(row);
    const current = await this.findProductById(workspaceId, productId);
    if (!current) throw catalogNotFound('Product');
    throw catalogVersionConflict(current.version);
  }

  async archiveProductCascade(
    workspaceId: string,
    productId: string,
    expectedVersion: number
  ): Promise<CatalogProductRecord> {
    // Product + every active variant flip inside one transaction —
    // no partial archive possible. The product version gate serializes
    // concurrent archives (loser gets 409 with the current version).
    return this.inTx(async (tx) => {
      const now = new Date();
      const archived = await tx
        .update(catalogProducts)
        .set({
          status: 'archived',
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(catalogProducts.id, productId),
            eq(catalogProducts.workspaceId, workspaceId),
            eq(catalogProducts.version, expectedVersion)
          )
        )
        .returning();
      const productRow = archived[0];
      if (productRow) {
        await tx
          .update(catalogVariants)
          .set({
            status: 'archived',
            version: sql`${catalogVariants.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(catalogVariants.productId, productId),
              eq(catalogVariants.workspaceId, workspaceId),
              eq(catalogVariants.status, 'active')
            )
          );
        return toProduct(productRow);
      }
      const store = new DrizzleCatalogStore(tx);
      const current = await store.findProductById(workspaceId, productId);
      if (!current) throw catalogNotFound('Product');
      if (current.status === 'archived') return current;
      throw catalogVersionConflict(current.version);
    });
  }

  // Variants

  async createVariant(
    workspaceId: string,
    productId: string,
    input: NewVariantInput
  ): Promise<CatalogVariantRecord> {
    try {
      const inserted = await this.db
        .insert(catalogVariants)
        .values({
          workspaceId,
          productId,
          skuCode: input.skuCode,
          name: input.name ?? null,
          barcode: input.barcode ?? null,
          sellingPriceCents: input.sellingPriceCents,
          currency: (input.currency ?? 'IDR').toUpperCase(),
          hppCents: input.hppCents ?? null,
          costSource: input.costSource ?? null,
          minStockQty: null,
          leadTimeDays: null,
          listingName: input.listingName ?? null,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert catalog variant');
      return toVariant(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.findVariantBySku(
          workspaceId,
          input.skuCode
        );
        throw catalogConflict(
          `SKU code ${input.skuCode} is already in use.`,
          existing
            ? {
                existingPath: `/api/workspaces/${workspaceId}/catalog/products/${existing.productId}/variants/${existing.id}`,
                existingVariantId: existing.id,
                existingProductId: existing.productId,
              }
            : undefined
        );
      }
      throw err;
    }
  }

  async findVariantById(
    workspaceId: string,
    variantId: string
  ): Promise<CatalogVariantRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogVariants)
      .where(
        and(
          eq(catalogVariants.id, variantId),
          eq(catalogVariants.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toVariant(row) : null;
  }

  async findVariantBySku(
    workspaceId: string,
    skuCode: string
  ): Promise<CatalogVariantRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogVariants)
      .where(
        and(
          eq(catalogVariants.workspaceId, workspaceId),
          eq(catalogVariants.skuCode, skuCode)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toVariant(row) : null;
  }

  async listVariantsByProduct(
    workspaceId: string,
    productId: string
  ): Promise<CatalogVariantRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogVariants)
      .where(
        and(
          eq(catalogVariants.workspaceId, workspaceId),
          eq(catalogVariants.productId, productId)
        )
      );
    return rows.map(toVariant);
  }

  async listVariantsByWorkspace(
    workspaceId: string
  ): Promise<CatalogVariantRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogVariants)
      .where(eq(catalogVariants.workspaceId, workspaceId));
    return rows.map(toVariant);
  }

  async updateVariant(
    workspaceId: string,
    variantId: string,
    patch: {
      skuCode?: string;
      name?: string | null;
      barcode?: string | null;
      sellingPriceCents?: number;
      hppCents?: number | null;
      costSource?: string | null;
      minStockQty?: number | null;
      leadTimeDays?: number | null;
      listingName?: string | null;
      status?: CatalogStatus;
    },
    expectedVersion: number
  ): Promise<CatalogVariantRecord> {
    try {
      const updated = await this.db
        .update(catalogVariants)
        .set({
          ...patch,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(catalogVariants.id, variantId),
            eq(catalogVariants.workspaceId, workspaceId),
            eq(catalogVariants.version, expectedVersion)
          )
        )
        .returning();
      const row = updated[0];
      if (row) return toVariant(row);
    } catch (err) {
      if (isUniqueViolation(err) && patch.skuCode) {
        const existing = await this.findVariantBySku(
          workspaceId,
          patch.skuCode
        );
        throw catalogConflict(
          `SKU code ${patch.skuCode} is already in use.`,
          existing
            ? {
                existingPath: `/api/workspaces/${workspaceId}/catalog/products/${existing.productId}/variants/${existing.id}`,
                existingVariantId: existing.id,
                existingProductId: existing.productId,
              }
            : undefined
        );
      }
      throw err;
    }
    const current = await this.findVariantById(workspaceId, variantId);
    if (!current) throw catalogNotFound('Variant');
    throw catalogVersionConflict(current.version);
  }

  // Warehouses

  async createWarehouse(input: {
    workspaceId: string;
    code: string;
    name: string;
  }): Promise<WarehouseRecord> {
    try {
      const inserted = await this.db
        .insert(catalogWarehouses)
        .values({
          workspaceId: input.workspaceId,
          code: input.code,
          name: input.name,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert warehouse');
      return toWarehouse(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw catalogConflict(
          `Warehouse code ${input.code} is already in use.`
        );
      }
      throw err;
    }
  }

  async findWarehouseById(
    workspaceId: string,
    warehouseId: string
  ): Promise<WarehouseRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogWarehouses)
      .where(
        and(
          eq(catalogWarehouses.id, warehouseId),
          eq(catalogWarehouses.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toWarehouse(row) : null;
  }

  async listWarehouses(workspaceId: string): Promise<WarehouseRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogWarehouses)
      .where(eq(catalogWarehouses.workspaceId, workspaceId));
    return rows.map(toWarehouse);
  }

  async updateWarehouse(
    workspaceId: string,
    warehouseId: string,
    patch: { name?: string; status?: WarehouseStatus },
    expectedVersion: number
  ): Promise<WarehouseRecord> {
    const updated = await this.db
      .update(catalogWarehouses)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(catalogWarehouses.id, warehouseId),
          eq(catalogWarehouses.workspaceId, workspaceId),
          eq(catalogWarehouses.version, expectedVersion)
        )
      )
      .returning();
    const row = updated[0];
    if (row) return toWarehouse(row);
    const current = await this.findWarehouseById(workspaceId, warehouseId);
    if (!current) throw catalogNotFound('Warehouse');
    throw catalogVersionConflict(current.version);
  }

  // Stock

  async adjustLevel(input: {
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
  }): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord }> {
    const run = async (tx: DbOrTx) => {
      // Idempotency first (inside the tx so check + insert are atomic):
      // a retried key resolves to the original result; a key reused
      // with a different payload is a 409.
      if (input.idempotencyKey) {
        const seenRows = await tx
          .select()
          .from(catalogStockLedger)
          .where(
            and(
              eq(catalogStockLedger.workspaceId, input.workspaceId),
              eq(catalogStockLedger.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        const seen = seenRows[0];
        if (seen) {
          if (
            seen.variantId !== input.variantId ||
            seen.warehouseId !== input.warehouseId ||
            seen.delta !== input.delta ||
            seen.reason !== input.reason
          ) {
            throw catalogConflict(
              'Idempotency key was already used for a different adjustment.'
            );
          }
          const levelRows = await tx
            .select()
            .from(catalogInventoryLevels)
            .where(
              and(
                eq(catalogInventoryLevels.variantId, seen.variantId),
                eq(catalogInventoryLevels.warehouseId, seen.warehouseId)
              )
            )
            .limit(1);
          const levelRow = levelRows[0];
          if (!levelRow) throw catalogNotFound('Inventory level');
          return {
            level: toLevel(levelRow),
            entry: toLedgerEntry(seen),
          };
        }
      }
      const existing = await tx
        .select()
        .from(catalogInventoryLevels)
        .where(
          and(
            eq(catalogInventoryLevels.variantId, input.variantId),
            eq(catalogInventoryLevels.warehouseId, input.warehouseId)
          )
        )
        .limit(1);
      const current = existing[0];
      if (current && current.workspaceId !== input.workspaceId) {
        throw catalogNotFound('Inventory level');
      }
      if (current) {
        if (
          input.expectedVersion !== undefined &&
          current.version !== input.expectedVersion
        ) {
          throw catalogVersionConflict(current.version);
        }
      } else if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== 0
      ) {
        throw catalogVersionConflict(0);
      }
      const currentQty = current?.qty ?? 0;
      try {
        CatalogRules.assertBalanceAllowed({
          currentQty,
          delta: input.delta,
          allowNegative: input.allowNegative,
        });
      } catch (err) {
        if (err instanceof BusinessRuleViolationError) {
          throw catalogInsufficientStock();
        }
        throw err;
      }
      const balanceAfter = currentQty + input.delta;
      let entryRow: CatalogStockLedgerRow | undefined;
      try {
        const entries = await tx
          .insert(catalogStockLedger)
          .values({
            workspaceId: input.workspaceId,
            variantId: input.variantId,
            warehouseId: input.warehouseId,
            delta: input.delta,
            balanceAfter,
            reason: input.reason,
            actorId: input.actorId,
            correlationId: input.correlationId ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
          })
          .returning();
        entryRow = entries[0];
      } catch (err) {
        if (!isUniqueViolation(err) || !input.idempotencyKey) throw err;
        // Lost an idempotency race with a concurrent retry. The failed
        // statement aborted this transaction, so the winner is resolved
        // AFTER rollback — only possible on the root handle.
        if (!this.isRootHandle()) throw err;
        const winner = await this.findLedgerEntryByIdempotencyKey(
          input.workspaceId,
          input.idempotencyKey
        );
        if (!winner) throw err;
        if (
          winner.entry.variantId !== input.variantId ||
          winner.entry.warehouseId !== input.warehouseId ||
          winner.entry.delta !== input.delta ||
          winner.entry.reason !== input.reason
        ) {
          throw catalogConflict(
            'Idempotency key was already used for a different adjustment.'
          );
        }
        return winner;
      }
      if (!entryRow) throw new Error('Failed to append stock ledger');
      if (current) {
        const leveled = await tx
          .update(catalogInventoryLevels)
          .set({
            qty: balanceAfter,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(catalogInventoryLevels.id, current.id),
              eq(catalogInventoryLevels.version, current.version)
            )
          )
          .returning();
        const levelRow = leveled[0];
        if (!levelRow) {
          // Lost a race with a concurrent adjustment (no statement error,
          // so the tx is still usable): re-read for the truthful version.
          const reread = await tx
            .select()
            .from(catalogInventoryLevels)
            .where(eq(catalogInventoryLevels.id, current.id))
            .limit(1);
          const latest = reread[0];
          if (!latest) throw catalogNotFound('Inventory level');
          throw catalogVersionConflict(toLevel(latest).version);
        }
        return { level: toLevel(levelRow), entry: toLedgerEntry(entryRow) };
      }
      try {
        const leveled = await tx
          .insert(catalogInventoryLevels)
          .values({
            workspaceId: input.workspaceId,
            variantId: input.variantId,
            warehouseId: input.warehouseId,
            qty: balanceAfter,
          })
          .returning();
        const levelRow = leveled[0];
        if (!levelRow) throw new Error('Failed to insert inventory level');
        return { level: toLevel(levelRow), entry: toLedgerEntry(entryRow) };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Lost a first-insert race with a concurrent adjustment. The failed
        // statement aborted this transaction, so the truthful version is
        // resolved AFTER rollback — only possible on the root handle.
        if (!this.isRootHandle()) throw err;
        const latest = await this.getLevel(
          input.workspaceId,
          input.variantId,
          input.warehouseId
        );
        throw catalogVersionConflict(latest?.version ?? 1);
      }
    };
    return this.inTx(run);
  }

  async findLedgerEntryByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord } | null> {
    const rows = await this.db
      .select()
      .from(catalogStockLedger)
      .where(
        and(
          eq(catalogStockLedger.workspaceId, workspaceId),
          eq(catalogStockLedger.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    const entry = rows[0];
    if (!entry) return null;
    const level = await this.getLevel(
      workspaceId,
      entry.variantId,
      entry.warehouseId
    );
    if (!level) return null;
    return { level, entry: toLedgerEntry(entry) };
  }

  async getLevel(
    workspaceId: string,
    variantId: string,
    warehouseId: string
  ): Promise<InventoryLevelRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogInventoryLevels)
      .where(
        and(
          eq(catalogInventoryLevels.variantId, variantId),
          eq(catalogInventoryLevels.warehouseId, warehouseId),
          eq(catalogInventoryLevels.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toLevel(row) : null;
  }

  async listLevelsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<InventoryLevelRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogInventoryLevels)
      .where(
        and(
          eq(catalogInventoryLevels.workspaceId, workspaceId),
          eq(catalogInventoryLevels.variantId, variantId)
        )
      );
    return rows.map(toLevel);
  }

  async listLedgerByVariant(
    workspaceId: string,
    variantId: string,
    limit: number,
    filters?: { warehouseId?: string }
  ): Promise<StockLedgerRecord[]> {
    const conditions = [
      eq(catalogStockLedger.workspaceId, workspaceId),
      eq(catalogStockLedger.variantId, variantId),
    ];
    if (filters?.warehouseId !== undefined) {
      conditions.push(eq(catalogStockLedger.warehouseId, filters.warehouseId));
    }
    const rows = await this.db
      .select()
      .from(catalogStockLedger)
      .where(and(...conditions))
      .orderBy(desc(catalogStockLedger.createdAt))
      .limit(Math.max(1, limit));
    return rows.map(toLedgerEntry);
  }

  async countMovements(
    workspaceId: string,
    variantId: string
  ): Promise<number> {
    const rows = await this.db
      .select({ n: count() })
      .from(catalogStockLedger)
      .where(
        and(
          eq(catalogStockLedger.workspaceId, workspaceId),
          eq(catalogStockLedger.variantId, variantId)
        )
      );
    return rows[0]?.n ?? 0;
  }

  async getStockSettings(workspaceId: string): Promise<StockSettingsRecord> {
    const rows = await this.db
      .select()
      .from(catalogStockSettings)
      .where(eq(catalogStockSettings.workspaceId, workspaceId))
      .limit(1);
    const existing = rows[0];
    if (existing) return toStockSettings(existing);
    // Lazy-create the default (oversell OFF) so fresh workspaces need
    // no backfill. A lost insert race resolves to the winner's row.
    try {
      const inserted = await this.db
        .insert(catalogStockSettings)
        .values({ workspaceId })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert stock settings');
      return toStockSettings(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const reread = await this.db
        .select()
        .from(catalogStockSettings)
        .where(eq(catalogStockSettings.workspaceId, workspaceId))
        .limit(1);
      const winner = reread[0];
      if (!winner) throw err;
      return toStockSettings(winner);
    }
  }

  async updateStockSettings(
    workspaceId: string,
    patch: { allowNegative: boolean },
    expectedVersion: number
  ): Promise<StockSettingsRecord> {
    // Ensure the row exists before the CAS update (lazy default).
    await this.getStockSettings(workspaceId);
    const updated = await this.db
      .update(catalogStockSettings)
      .set({
        allowNegative: patch.allowNegative,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(catalogStockSettings.workspaceId, workspaceId),
          eq(catalogStockSettings.version, expectedVersion)
        )
      )
      .returning();
    const row = updated[0];
    if (row) return toStockSettings(row);
    const current = await this.getStockSettings(workspaceId);
    throw catalogVersionConflict(current.version);
  }

  // Mappings

  async createMapping(input: {
    workspaceId: string;
    variantId: string;
    channel: string;
    shopExtId: string;
    platformSkuId: string;
    sellerSkuHint: string | null;
    barcodeHint: string | null;
    listingName: string | null;
  }): Promise<ChannelMappingRecord> {
    try {
      const inserted = await this.db
        .insert(catalogChannelMappings)
        .values({
          workspaceId: input.workspaceId,
          variantId: input.variantId,
          channel: input.channel,
          shopExtId: input.shopExtId,
          platformSkuId: input.platformSkuId,
          sellerSkuHint: input.sellerSkuHint,
          barcodeHint: input.barcodeHint,
          listingName: input.listingName,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert channel mapping');
      return toMapping(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw catalogConflict(
          'This channel listing is already mapped to a SKU TokoBoss.'
        );
      }
      throw err;
    }
  }

  async listMappingsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<ChannelMappingRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogChannelMappings)
      .where(
        and(
          eq(catalogChannelMappings.workspaceId, workspaceId),
          eq(catalogChannelMappings.variantId, variantId)
        )
      );
    return rows.map(toMapping);
  }

  async listMappingsByWorkspace(
    workspaceId: string
  ): Promise<ChannelMappingRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogChannelMappings)
      .where(eq(catalogChannelMappings.workspaceId, workspaceId));
    return rows.map(toMapping);
  }

  async countMappings(workspaceId: string, variantId: string): Promise<number> {
    const rows = await this.db
      .select({ n: count() })
      .from(catalogChannelMappings)
      .where(
        and(
          eq(catalogChannelMappings.workspaceId, workspaceId),
          eq(catalogChannelMappings.variantId, variantId)
        )
      );
    return rows[0]?.n ?? 0;
  }

  async deleteMapping(workspaceId: string, mappingId: string): Promise<void> {
    const rows = await this.db
      .delete(catalogChannelMappings)
      .where(
        and(
          eq(catalogChannelMappings.id, mappingId),
          eq(catalogChannelMappings.workspaceId, workspaceId)
        )
      )
      .returning({ id: catalogChannelMappings.id });
    if (!rows[0]) throw catalogNotFound('Mapping');
  }

  async findRecommendationState(
    workspaceId: string,
    variantId: string
  ): Promise<CatalogRecommendationStateRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogRecommendationStates)
      .where(
        and(
          eq(catalogRecommendationStates.workspaceId, workspaceId),
          eq(catalogRecommendationStates.variantId, variantId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecommendationState(row) : null;
  }

  async upsertRecommendationState(
    workspaceId: string,
    variantId: string,
    input: {
      status: RecommendationStateStatus;
      snoozedUntil: Date | null;
      suggestedReorderQtyOverride: number | null;
    },
    expectedVersion: number | null
  ): Promise<CatalogRecommendationStateRecord> {
    const variant = await this.findVariantById(workspaceId, variantId);
    if (!variant) {
      throw catalogNotFound('Variant');
    }
    if (!isRecommendationStateStatus(input.status)) {
      throw catalogValidation(
        `Invalid recommendation status: ${String(input.status)}`
      );
    }
    if (input.status === 'snoozed') {
      if (
        !(input.snoozedUntil instanceof Date) ||
        Number.isNaN(input.snoozedUntil.getTime())
      ) {
        throw catalogValidation(
          'snoozedUntil is required when status is snoozed'
        );
      }
    } else if (input.snoozedUntil !== null) {
      throw catalogValidation(
        'snoozedUntil must be null unless status is snoozed'
      );
    }
    if (input.suggestedReorderQtyOverride !== null) {
      const qty = input.suggestedReorderQtyOverride;
      if (!Number.isInteger(qty) || qty < 1) {
        throw catalogValidation(
          'suggestedReorderQtyOverride must be an integer >= 1'
        );
      }
    }

    const existingRows = await this.db
      .select()
      .from(catalogRecommendationStates)
      .where(
        and(
          eq(catalogRecommendationStates.workspaceId, workspaceId),
          eq(catalogRecommendationStates.variantId, variantId)
        )
      )
      .limit(1);
    const existing = existingRows[0];

    const now = new Date();

    if (!existing) {
      if (expectedVersion !== null) {
        throw catalogVersionConflict(0);
      }
      const inserted = await this.db
        .insert(catalogRecommendationStates)
        .values({
          workspaceId,
          variantId,
          status: input.status,
          snoozedUntil: input.snoozedUntil,
          suggestedReorderQtyOverride: input.suggestedReorderQtyOverride,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert recommendation state');
      return toRecommendationState(row);
    }

    if (expectedVersion !== existing.version) {
      throw catalogVersionConflict(existing.version);
    }

    const updated = await this.db
      .update(catalogRecommendationStates)
      .set({
        status: input.status,
        snoozedUntil: input.snoozedUntil,
        suggestedReorderQtyOverride: input.suggestedReorderQtyOverride,
        version: existing.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(catalogRecommendationStates.id, existing.id),
          eq(catalogRecommendationStates.workspaceId, workspaceId),
          eq(catalogRecommendationStates.version, existing.version)
        )
      )
      .returning();
    const row = updated[0];
    if (row) return toRecommendationState(row);
    const reread = await this.db
      .select()
      .from(catalogRecommendationStates)
      .where(
        and(
          eq(catalogRecommendationStates.workspaceId, workspaceId),
          eq(catalogRecommendationStates.variantId, variantId)
        )
      )
      .limit(1);
    throw catalogVersionConflict(reread[0]?.version ?? existing.version);
  }

  // Bundle BOM (UTA-79, Story 13)

  /**
   * Replace-or-clear helper: compare-and-set on the bundle variant's
   * version, swap the line set, and bump the variant version — all in one
   * transaction so concurrent BOM edits never silently overwrite.
   */
  private async writeBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    lines: NewBundleLineInput[],
    expectedVersion: number
  ): Promise<{ lines: BundleLineRecord[]; bundleVersion: number }> {
    return this.inTx(async (tx) => {
      const bumped = await tx
        .update(catalogVariants)
        .set({ version: expectedVersion + 1, updatedAt: new Date() })
        .where(
          and(
            eq(catalogVariants.id, bundleVariantId),
            eq(catalogVariants.workspaceId, workspaceId),
            eq(catalogVariants.version, expectedVersion)
          )
        )
        .returning({ version: catalogVariants.version });
      const next = bumped[0];
      if (!next) {
        // Resolve the truthful version on `tx` (same transaction — a
        // lookup on the root handle would deadlock single-connection
        // drivers like PGlite while the tx is open).
        const reread = await tx
          .select()
          .from(catalogVariants)
          .where(
            and(
              eq(catalogVariants.id, bundleVariantId),
              eq(catalogVariants.workspaceId, workspaceId)
            )
          )
          .limit(1);
        const current = reread[0];
        if (!current) throw catalogNotFound('Variant');
        throw bundleVersionConflict(toVariant(current).version);
      }
      await tx
        .delete(catalogBundleLines)
        .where(
          and(
            eq(catalogBundleLines.workspaceId, workspaceId),
            eq(catalogBundleLines.bundleVariantId, bundleVariantId)
          )
        );
      const stored: BundleLineRecord[] = [];
      for (const line of lines) {
        const inserted = await tx
          .insert(catalogBundleLines)
          .values({
            workspaceId,
            bundleVariantId,
            componentVariantId: line.componentVariantId,
            qty: line.qty,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to insert bundle line');
        stored.push(toBundleLine(row));
      }
      return { lines: stored, bundleVersion: next.version };
    });
  }

  async replaceBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    lines: NewBundleLineInput[],
    expectedVersion: number
  ): Promise<{ lines: BundleLineRecord[]; bundleVersion: number }> {
    try {
      return await this.writeBundleLines(
        workspaceId,
        bundleVariantId,
        lines,
        expectedVersion
      );
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: unknown }).code === 'BUNDLE_VERSION_CONFLICT'
      ) {
        throw err;
      }
      if (isUniqueViolation(err)) {
        throw bundleConflict('A component may appear only once per bundle.');
      }
      throw err;
    }
  }

  async clearBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    expectedVersion: number
  ): Promise<{ bundleVersion: number }> {
    const { bundleVersion } = await this.writeBundleLines(
      workspaceId,
      bundleVariantId,
      [],
      expectedVersion
    );
    return { bundleVersion };
  }

  async listBundleLines(
    workspaceId: string,
    bundleVariantId: string
  ): Promise<BundleLineRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogBundleLines)
      .where(
        and(
          eq(catalogBundleLines.workspaceId, workspaceId),
          eq(catalogBundleLines.bundleVariantId, bundleVariantId)
        )
      );
    return rows.map(toBundleLine);
  }

  async listBundlesByWorkspace(
    workspaceId: string
  ): Promise<BundleLineRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogBundleLines)
      .where(eq(catalogBundleLines.workspaceId, workspaceId));
    return rows.map(toBundleLine);
  }

  async listBundlesUsingComponent(
    workspaceId: string,
    componentVariantId: string
  ): Promise<BundleLineRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogBundleLines)
      .where(
        and(
          eq(catalogBundleLines.workspaceId, workspaceId),
          eq(catalogBundleLines.componentVariantId, componentVariantId)
        )
      );
    return rows.map(toBundleLine);
  }

  async isBundleVariant(
    workspaceId: string,
    variantId: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: catalogBundleLines.id })
      .from(catalogBundleLines)
      .where(
        and(
          eq(catalogBundleLines.workspaceId, workspaceId),
          eq(catalogBundleLines.bundleVariantId, variantId)
        )
      )
      .limit(1);
    return rows.length > 0;
  }
  async createTransferDraft(input: {
    workspaceId: string;
    referenceNum: string;
    sourceWarehouseId: string;
    destWarehouseId: string;
    notes?: string;
    expectedReceiveDate?: Date;
  }): Promise<TransferRecord> {
    try {
      const inserted = await this.db
        .insert(catalogTransfers)
        .values({
          workspaceId: input.workspaceId,
          referenceNum: input.referenceNum,
          sourceWarehouseId: input.sourceWarehouseId,
          destWarehouseId: input.destWarehouseId,
          status: 'draft',
          notes: input.notes ?? null,
          expectedReceiveDate: input.expectedReceiveDate ?? null,
          version: 1,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert transfer');
      return toTransfer(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw catalogConflict(
        `Reference number ${input.referenceNum} already exists.`
      );
    }
  }

  async findTransferById(
    workspaceId: string,
    transferId: string
  ): Promise<TransferRecord | null> {
    const rows = await this.db
      .select()
      .from(catalogTransfers)
      .where(
        and(
          eq(catalogTransfers.workspaceId, workspaceId),
          eq(catalogTransfers.id, transferId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toTransfer(row) : null;
  }

  async listTransfers(workspaceId: string): Promise<TransferRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogTransfers)
      .where(eq(catalogTransfers.workspaceId, workspaceId))
      .orderBy(asc(catalogTransfers.createdAt));
    return rows.map(toTransfer);
  }

  async addTransferItems(input: {
    workspaceId: string;
    transferId: string;
    items: Array<{ variantId: string; requestedQty: number }>;
  }): Promise<TransferItemRecord[]> {
    const transfer = await this.findTransferById(
      input.workspaceId,
      input.transferId
    );
    if (!transfer) throw catalogNotFound('Transfer');
    if (transfer.status !== 'draft') {
      throw catalogConflict(
        'Cannot add items to a transfer that is not in draft status.'
      );
    }
    for (const item of input.items) {
      if (item.requestedQty <= 0) {
        throw catalogValidation(
          `Requested quantity must be greater than 0, got ${item.requestedQty}`
        );
      }
    }
    if (input.items.length === 0) return [];
    const inserted = await this.db
      .insert(catalogTransferItems)
      .values(
        input.items.map((item) => ({
          transferId: input.transferId,
          workspaceId: input.workspaceId,
          variantId: item.variantId,
          requestedQty: item.requestedQty,
          sentQty: 0,
          receivedQty: 0,
          damagedQty: 0,
          cancellationReason: null,
          version: 1,
        }))
      )
      .returning();
    return inserted.map(toTransferItem);
  }

  async findTransferWithItems(
    workspaceId: string,
    transferId: string
  ): Promise<TransferWithItems | null> {
    const transfer = await this.findTransferById(workspaceId, transferId);
    if (!transfer) return null;
    const rows = await this.db
      .select()
      .from(catalogTransferItems)
      .where(
        and(
          eq(catalogTransferItems.workspaceId, workspaceId),
          eq(catalogTransferItems.transferId, transferId)
        )
      )
      .orderBy(asc(catalogTransferItems.createdAt));
    return { transfer, items: rows.map(toTransferItem) };
  }

  async listTransfersWithItems(
    workspaceId: string
  ): Promise<TransferWithItems[]> {
    const transfers = await this.listTransfers(workspaceId);
    const out: TransferWithItems[] = [];
    for (const transfer of transfers) {
      const rows = await this.db
        .select()
        .from(catalogTransferItems)
        .where(
          and(
            eq(catalogTransferItems.workspaceId, workspaceId),
            eq(catalogTransferItems.transferId, transfer.id)
          )
        )
        .orderBy(asc(catalogTransferItems.createdAt));
      out.push({ transfer, items: rows.map(toTransferItem) });
    }
    return out;
  }

  async sendTransfer(input: {
    workspaceId: string;
    transferId: string;
    actorId: string | null;
    expectedVersion?: number;
    idempotencyKey?: string;
  }): Promise<TransferWithItems> {
    return this.inTx(async (tx) => {
      const transferRows = await tx
        .select()
        .from(catalogTransfers)
        .where(
          and(
            eq(catalogTransfers.workspaceId, input.workspaceId),
            eq(catalogTransfers.id, input.transferId)
          )
        )
        .limit(1);
      const transferRow = transferRows[0];
      if (!transferRow) throw catalogNotFound('Transfer');

      const transfer = toTransfer(transferRow);
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== transfer.version
      ) {
        throw catalogVersionConflict(transfer.version);
      }
      if (transfer.status !== 'draft') {
        throw catalogConflict('Only draft transfers can be sent.');
      }

      const itemRows = await tx
        .select()
        .from(catalogTransferItems)
        .where(
          and(
            eq(catalogTransferItems.workspaceId, input.workspaceId),
            eq(catalogTransferItems.transferId, input.transferId)
          )
        )
        .orderBy(asc(catalogTransferItems.createdAt));
      if (itemRows.length === 0) {
        throw catalogValidation('Cannot send a transfer with no items.');
      }

      const txStore = this.withTransaction(tx);
      const stockSettings = await txStore.getStockSettings(input.workspaceId);
      for (const item of itemRows) {
        await txStore.adjustLevel({
          workspaceId: input.workspaceId,
          variantId: item.variantId,
          warehouseId: transfer.sourceWarehouseId,
          delta: -item.requestedQty,
          reason: 'transfer_send',
          actorId: input.actorId,
          correlationId: transfer.id,
          idempotencyKey: input.idempotencyKey
            ? `${input.idempotencyKey}:${item.id}`
            : undefined,
          allowNegative: stockSettings.allowNegative,
        });
      }

      const now = new Date();
      const updatedItems: TransferItemRecord[] = [];
      for (const item of itemRows) {
        const rows = await tx
          .update(catalogTransferItems)
          .set({
            sentQty: item.requestedQty,
            version: item.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(catalogTransferItems.id, item.id),
              eq(catalogTransferItems.workspaceId, input.workspaceId),
              eq(catalogTransferItems.version, item.version)
            )
          )
          .returning();
        const updated = rows[0];
        if (!updated) throw catalogVersionConflict(item.version + 1);
        updatedItems.push(toTransferItem(updated));
      }

      const updatedTransfers = await tx
        .update(catalogTransfers)
        .set({
          status: 'sent',
          version: transfer.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(catalogTransfers.id, transfer.id),
            eq(catalogTransfers.workspaceId, input.workspaceId),
            eq(catalogTransfers.status, 'draft'),
            eq(catalogTransfers.version, transfer.version)
          )
        )
        .returning();
      const updatedTransfer = updatedTransfers[0];
      if (!updatedTransfer) {
        const currentRows = await tx
          .select()
          .from(catalogTransfers)
          .where(eq(catalogTransfers.id, transfer.id))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw catalogNotFound('Transfer');
        if (current.status !== 'draft') {
          throw catalogConflict('Only draft transfers can be sent.');
        }
        throw catalogVersionConflict(current.version);
      }

      return {
        transfer: toTransfer(updatedTransfer),
        items: updatedItems,
      };
    });
  }

  async receiveTransfer(input: {
    workspaceId: string;
    transferId: string;
    actorId: string | null;
    expectedVersion?: number;
    idempotencyKey?: string;
    /** Omit = full remaining as good receipt for every item. */
    items?: Array<{
      itemId: string;
      receivedQty: number;
      damagedQty?: number;
    }>;
  }): Promise<TransferWithItems> {
    return this.inTx(async (tx) => {
      const transferRows = await tx
        .select()
        .from(catalogTransfers)
        .where(
          and(
            eq(catalogTransfers.workspaceId, input.workspaceId),
            eq(catalogTransfers.id, input.transferId)
          )
        )
        .limit(1);
      const transferRow = transferRows[0];
      if (!transferRow) throw catalogNotFound('Transfer');

      const transfer = toTransfer(transferRow);
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== transfer.version
      ) {
        throw catalogVersionConflict(transfer.version);
      }
      if (transfer.status !== 'sent') {
        throw catalogConflict('Only sent transfers can be received.');
      }

      const itemRows: CatalogTransferItemRow[] = await tx
        .select()
        .from(catalogTransferItems)
        .where(
          and(
            eq(catalogTransferItems.workspaceId, input.workspaceId),
            eq(catalogTransferItems.transferId, input.transferId)
          )
        )
        .orderBy(asc(catalogTransferItems.createdAt));
      if (itemRows.length === 0) {
        throw catalogValidation('Cannot receive a transfer with no items.');
      }

      type ReceiptLine = {
        itemId: string;
        receivedQty: number;
        damagedQty?: number;
      };
      const receiptByItemId = new Map<string, ReceiptLine>(
        (input.items ?? []).map((item) => [item.itemId, item])
      );
      if (input.items) {
        const seenItemIds = new Set<string>();
        const itemMap = new Map<string, CatalogTransferItemRow>(
          itemRows.map((row) => [row.id, row])
        );
        for (const itemData of input.items) {
          if (seenItemIds.has(itemData.itemId)) {
            throw catalogValidation(
              'Each transfer item may only be received once.'
            );
          }
          seenItemIds.add(itemData.itemId);
          const item = itemMap.get(itemData.itemId);
          if (!item) throw catalogNotFound('TransferItem');
          const damagedQty = itemData.damagedQty ?? 0;
          if (itemData.receivedQty < 0 || damagedQty < 0) {
            throw catalogValidation(
              'Received and damaged quantities must be non-negative.'
            );
          }
          const remaining =
            item.sentQty - item.receivedQty - (item.damagedQty || 0);
          if (itemData.receivedQty + damagedQty > remaining) {
            throw catalogValidation(
              'Cannot receive more than remaining sent quantity.'
            );
          }
        }
      }

      const txStore = this.withTransaction(tx);
      const now = new Date();
      const updatedItems: TransferItemRecord[] = [];
      const creditDeltas = new Map<string, number>();

      for (const item of itemRows) {
        const remaining =
          item.sentQty - item.receivedQty - (item.damagedQty || 0);
        let receiveQty = 0;
        let damagedQty = 0;

        if (input.items) {
          const itemData = receiptByItemId.get(item.id);
          if (!itemData) {
            updatedItems.push(toTransferItem(item));
            continue;
          }
          receiveQty = itemData.receivedQty;
          damagedQty = itemData.damagedQty ?? 0;
        } else {
          receiveQty = remaining;
        }

        if (receiveQty === 0 && damagedQty === 0) {
          updatedItems.push(toTransferItem(item));
          continue;
        }

        const rows = await tx
          .update(catalogTransferItems)
          .set({
            receivedQty: item.receivedQty + receiveQty,
            damagedQty: (item.damagedQty || 0) + damagedQty,
            version: item.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(catalogTransferItems.id, item.id),
              eq(catalogTransferItems.workspaceId, input.workspaceId),
              eq(catalogTransferItems.version, item.version)
            )
          )
          .returning();
        const updated = rows[0];
        if (!updated) throw catalogVersionConflict(item.version + 1);
        updatedItems.push(toTransferItem(updated));
        if (receiveQty > 0) creditDeltas.set(item.id, receiveQty);
      }

      for (const item of updatedItems) {
        const toCredit = creditDeltas.get(item.id) ?? 0;
        if (toCredit <= 0) continue;
        await txStore.adjustLevel({
          workspaceId: input.workspaceId,
          variantId: item.variantId,
          warehouseId: transfer.destWarehouseId,
          delta: toCredit,
          reason: 'transfer_receive',
          actorId: input.actorId,
          correlationId: transfer.id,
          idempotencyKey: input.idempotencyKey
            ? `${input.idempotencyKey}:${item.id}:receive`
            : undefined,
        });
      }

      const allReceived = updatedItems.every(
        (item) => item.sentQty - item.receivedQty - (item.damagedQty || 0) === 0
      );

      const updatedTransfers = await tx
        .update(catalogTransfers)
        .set({
          status: allReceived ? 'received' : 'sent',
          version: transfer.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(catalogTransfers.id, transfer.id),
            eq(catalogTransfers.workspaceId, input.workspaceId),
            eq(catalogTransfers.status, 'sent'),
            eq(catalogTransfers.version, transfer.version)
          )
        )
        .returning();
      const updatedTransfer = updatedTransfers[0];
      if (!updatedTransfer) {
        const currentRows = await tx
          .select()
          .from(catalogTransfers)
          .where(eq(catalogTransfers.id, transfer.id))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw catalogNotFound('Transfer');
        if (current.status !== 'sent') {
          throw catalogConflict('Only sent transfers can be received.');
        }
        throw catalogVersionConflict(current.version);
      }

      return {
        transfer: toTransfer(updatedTransfer),
        items: updatedItems,
      };
    });
  }

  async cancelTransfer(input: {
    workspaceId: string;
    transferId: string;
    actorId: string | null;
    expectedVersion?: number;
    idempotencyKey?: string;
  }): Promise<TransferWithItems> {
    return this.inTx(async (tx) => {
      const transferRows = await tx
        .select()
        .from(catalogTransfers)
        .where(
          and(
            eq(catalogTransfers.workspaceId, input.workspaceId),
            eq(catalogTransfers.id, input.transferId)
          )
        )
        .limit(1);
      const transferRow = transferRows[0];
      if (!transferRow) throw catalogNotFound('Transfer');

      const transfer = toTransfer(transferRow);

      // expectedVersion mismatch
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== transfer.version
      ) {
        throw catalogVersionConflict(transfer.version);
      }

      // received / cancelled
      if (transfer.status === 'received' || transfer.status === 'cancelled') {
        throw catalogConflict('Only draft or sent transfers can be cancelled.');
      }

      // Collect items
      const itemRows: CatalogTransferItemRow[] = await tx
        .select()
        .from(catalogTransferItems)
        .where(
          and(
            eq(catalogTransferItems.workspaceId, input.workspaceId),
            eq(catalogTransferItems.transferId, input.transferId)
          )
        )
        .orderBy(asc(catalogTransferItems.createdAt));

      // sent AND any item has receivedQty + damagedQty > 0
      if (transfer.status === 'sent') {
        const receivingStarted = itemRows.some(
          (item: CatalogTransferItemRow) =>
            item.receivedQty + (item.damagedQty || 0) > 0
        );
        if (receivingStarted) {
          throw catalogValidation(
            'Cannot cancel a transfer after receiving has started.'
          );
        }
      }

      // sent with zero receipts: restore source stock
      if (transfer.status === 'sent') {
        const txStore = this.withTransaction(tx);
        const stockSettings = await txStore.getStockSettings(input.workspaceId);
        const allowNegative = stockSettings.allowNegative;
        for (const item of itemRows) {
          if (item.sentQty > 0) {
            await txStore.adjustLevel({
              workspaceId: input.workspaceId,
              variantId: item.variantId,
              warehouseId: transfer.sourceWarehouseId,
              delta: item.sentQty,
              reason: 'transfer_cancel',
              actorId: input.actorId,
              correlationId: transfer.id,
              idempotencyKey: input.idempotencyKey
                ? `${input.idempotencyKey}:${item.id}`
                : undefined,
              allowNegative,
            });
          }
        }
      }

      const now = new Date();
      const updatedTransfers = await tx
        .update(catalogTransfers)
        .set({
          status: 'cancelled',
          version: transfer.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(catalogTransfers.id, transfer.id),
            eq(catalogTransfers.workspaceId, input.workspaceId),
            or(
              eq(catalogTransfers.status, 'draft'),
              eq(catalogTransfers.status, 'sent')
            ),
            eq(catalogTransfers.version, transfer.version)
          )
        )
        .returning();
      const updatedTransfer = updatedTransfers[0];
      if (!updatedTransfer) {
        const currentRows = await tx
          .select()
          .from(catalogTransfers)
          .where(eq(catalogTransfers.id, transfer.id))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw catalogNotFound('Transfer');
        if (current.status !== 'draft' && current.status !== 'sent') {
          throw catalogConflict(
            'Only draft or sent transfers can be cancelled.'
          );
        }
        throw catalogVersionConflict(current.version);
      }

      return {
        transfer: toTransfer(updatedTransfer),
        items: itemRows.map(toTransferItem),
      };
    });
  }
}
