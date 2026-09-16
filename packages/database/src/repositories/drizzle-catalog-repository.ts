import { BusinessRuleViolationError, CatalogRules } from '@tokoboss/domain';
import {
  catalogConflict,
  catalogInsufficientStock,
  catalogNotFound,
  catalogVersionConflict,
  isCatalogStatus,
  isWarehouseStatus,
} from '@tokoboss/application';
import type {
  CatalogProductRecord,
  CatalogStatus,
  CatalogStore,
  CatalogVariantRecord,
  ChannelMappingRecord,
  InventoryLevelRecord,
  NewVariantInput,
  ProductPicture,
  StockLedgerRecord,
  WarehouseRecord,
  WarehouseStatus,
} from '@tokoboss/application';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  catalogInventoryLevels,
  catalogProducts,
  catalogStockLedger,
  catalogVariants,
  catalogWarehouses,
} from '../schema/index';
import type {
  CatalogChannelMappingRow,
  CatalogInventoryLevelRow,
  CatalogProductRow,
  CatalogStockLedgerRow,
  CatalogVariantRow,
  CatalogWarehouseRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

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
    createdAt: row.createdAt,
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

function variantPath(
  workspaceId: string,
  variant: CatalogVariantRecord
): string {
  return `/api/workspaces/${workspaceId}/catalog/products/${variant.productId}/variants/${variant.id}`;
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
export class DrizzleCatalogStore implements CatalogStore {
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
    expectedVersion?: number;
  }): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord }> {
    const run = async (tx: DbOrTx) => {
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
        });
      } catch (err) {
        if (err instanceof BusinessRuleViolationError) {
          throw catalogInsufficientStock();
        }
        throw err;
      }
      const balanceAfter = currentQty + input.delta;
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
        })
        .returning();
      const entryRow = entries[0];
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
    limit: number
  ): Promise<StockLedgerRecord[]> {
    const rows = await this.db
      .select()
      .from(catalogStockLedger)
      .where(
        and(
          eq(catalogStockLedger.workspaceId, workspaceId),
          eq(catalogStockLedger.variantId, variantId)
        )
      )
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
}
