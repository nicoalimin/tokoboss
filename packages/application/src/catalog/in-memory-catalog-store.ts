import { BusinessRuleViolationError, CatalogRules } from '@tokoboss/domain';
import {
  catalogConflict,
  catalogInsufficientStock,
  catalogNotFound,
  catalogVersionConflict,
} from './catalog-errors';
import { bundleVersionConflict } from '../bundles/bundle-errors';
import type { CatalogStore } from './catalog-ports';
import type {
  BundleLineRecord,
  NewBundleLineInput,
} from '../bundles/bundle-types';
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
  TransferItemRecord,
  TransferRecord,
  TransferStatus,
  TransferWithItems,
  WarehouseRecord,
  WarehouseStatus,
} from './catalog-types';

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

/**
 * In-memory `CatalogStore` for unit tests and memory-mode web wiring.
 * Enforces the same contracts as Postgres: workspace scoping,
 * `(workspace, sku_code)` / `(workspace, channel, shop, platform_sku)` /
 * `(workspace, warehouse_code)` uniqueness, compare-and-set versions, and
 * atomic ledger-append + level-advance.
 */
export class InMemoryCatalogStore implements CatalogStore {
  private products = new Map<string, CatalogProductRecord>();
  private variants = new Map<string, CatalogVariantRecord>();
  private warehouses = new Map<string, WarehouseRecord>();
  private levels = new Map<string, InventoryLevelRecord>();
  private ledger: StockLedgerRecord[] = [];
  private mappings = new Map<string, ChannelMappingRecord>();
  // UTA-79: BOM lines keyed by line id; `(bundle, component)` uniqueness
  // is enforced on write (single-threaded memory semantics = atomic).
  private bundleLines = new Map<string, BundleLineRecord>();

  // UTA-94: warehouse transfers
  private transfers = new Map<string, TransferRecord>();
  private transferItems = new Map<string, TransferItemRecord>();
  // Idempotency keys for transfers (send/receive/cancel)
  private transferIdempotencyIndex = new Map<string, string>();
  // Index for looking up items by transfer ID
  private transferItemsIndex = new Map<string, string[]>();
  // Index for looking up transfers by reference number
  private transferReferenceIndex = new Map<string, string>();

  private skuIndex = new Map<string, string>();
  private warehouseCodeIndex = new Map<string, string>();
  private mappingKeyIndex = new Map<string, string>();
  // UTA-81: idempotency keys per workspace → ledger entry id.
  private idempotencyIndex = new Map<string, string>();
  private ledgerById = new Map<string, StockLedgerRecord>();
  // UTA-81: per-workspace stock policy (default allowNegative: false).
  private stockSettings = new Map<string, StockSettingsRecord>();

  private transferIdCounter = 0;
  private transferItemIdCounter = 0;

  // Idempotency keys for transfers (send/receive/cancel)
  private transferIdempotencyIndex = new Map<string, string>();
  // Index for looking up items by transfer ID
  private transferItemsIndex = new Map<string, string[]>();
  // Index for looking up transfers by reference number
  private transferReferenceIndex = new Map<string, string>();

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, '0')}`;
  }

  private nextTransferId(): string {
    this.transferIdCounter += 1;
    return `trf_${this.transferIdCounter.toString().padStart(4, '0')}`;
  }

  // UTA-94 transfer helper: next transfer item ID
  private nextTransferItemId(): string {
    this.transferItemIdCounter += 1;
    return `itm_${this.transferItemIdCounter.toString().padStart(4, '0')}`;
  }

  private variantPath(workspaceId: string, v: CatalogVariantRecord): string {
    return `/api/workspaces/${workspaceId}/catalog/products/${v.productId}/variants/${v.id}`;
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
    // Pre-check every SKU before persisting anything: the whole unit of
    // work commits atomically (single-threaded memory semantics).
    const seen = new Set<string>();
    for (const v of input.variants) {
      const key = `${input.workspaceId}::${v.skuCode}`;
      if (seen.has(key)) {
        throw catalogConflict(`SKU code ${v.skuCode} is duplicated.`);
      }
      seen.add(key);
      const clashId = this.skuIndex.get(key);
      if (clashId) {
        const clash = this.variants.get(clashId);
        throw catalogConflict(
          `SKU code ${v.skuCode} is already in use.`,
          clash
            ? {
                existingPath: this.variantPath(input.workspaceId, clash),
                existingVariantId: clash.id,
                existingProductId: clash.productId,
              }
            : undefined
        );
      }
    }
    const now = new Date();
    const product: CatalogProductRecord = {
      id: this.nextId('prd'),
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      unit: input.unit,
      pictures: clone(input.pictures),
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const variants: CatalogVariantRecord[] = input.variants.map((v) => ({
      id: this.nextId('var'),
      workspaceId: input.workspaceId,
      productId: product.id,
      skuCode: v.skuCode,
      name: v.name ?? null,
      barcode: v.barcode ?? null,
      sellingPriceCents: v.sellingPriceCents,
      currency: (v.currency ?? 'IDR').toUpperCase(),
      hppCents: v.hppCents ?? null,
      costSource: v.costSource ?? null,
      listingName: v.listingName ?? null,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }));
    this.products.set(product.id, product);
    for (const v of variants) {
      this.variants.set(v.id, v);
      this.skuIndex.set(`${input.workspaceId}::${v.skuCode}`, v.id);
    }
    return { product: clone(product), variants: clone(variants) };
  }

  async findProductById(
    workspaceId: string,
    productId: string
  ): Promise<CatalogProductRecord | null> {
    const record = this.products.get(productId);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async listProducts(workspaceId: string): Promise<CatalogProductRecord[]> {
    const out: CatalogProductRecord[] = [];
    for (const p of this.products.values()) {
      if (p.workspaceId === workspaceId) out.push(clone(p));
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
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
    const record = this.products.get(productId);
    if (!record || record.workspaceId !== workspaceId) {
      throw catalogNotFound('Product');
    }
    if (record.version !== expectedVersion) {
      throw catalogVersionConflict(record.version);
    }
    const updated: CatalogProductRecord = {
      ...clone(record),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.pictures !== undefined
        ? { pictures: clone(patch.pictures) }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      version: record.version + 1,
      updatedAt: new Date(),
    };
    this.products.set(productId, updated);
    return clone(updated);
  }

  async archiveProductCascade(
    workspaceId: string,
    productId: string,
    expectedVersion: number
  ): Promise<CatalogProductRecord> {
    // Single synchronous unit of work: version check, then product +
    // every active variant flip together — no partial archive possible.
    const record = this.products.get(productId);
    if (!record || record.workspaceId !== workspaceId) {
      throw catalogNotFound('Product');
    }
    if (record.status === 'archived') return clone(record);
    if (record.version !== expectedVersion) {
      throw catalogVersionConflict(record.version);
    }
    const now = new Date();
    this.products.set(productId, {
      ...record,
      status: 'archived',
      version: record.version + 1,
      updatedAt: now,
    });
    for (const variant of this.variants.values()) {
      if (
        variant.workspaceId === workspaceId &&
        variant.productId === productId &&
        variant.status === 'active'
      ) {
        this.variants.set(variant.id, {
          ...variant,
          status: 'archived',
          version: variant.version + 1,
          updatedAt: now,
        });
      }
    }
    const archived = this.products.get(productId);
    if (!archived) throw catalogNotFound('Product');
    return clone(archived);
  }

  // Variants

  async createVariant(
    workspaceId: string,
    productId: string,
    input: NewVariantInput
  ): Promise<CatalogVariantRecord> {
    const key = `${workspaceId}::${input.skuCode}`;
    const existingId = this.skuIndex.get(key);
    if (existingId) {
      const existing = this.variants.get(existingId);
      throw catalogConflict(
        `SKU code ${input.skuCode} is already in use.`,
        existing
          ? {
              existingPath: this.variantPath(workspaceId, existing),
              existingVariantId: existing.id,
              existingProductId: existing.productId,
            }
          : undefined
      );
    }
    const now = new Date();
    const record: CatalogVariantRecord = {
      id: this.nextId('var'),
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
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.variants.set(record.id, record);
    this.skuIndex.set(key, record.id);
    return clone(record);
  }

  async findVariantById(
    workspaceId: string,
    variantId: string
  ): Promise<CatalogVariantRecord | null> {
    const record = this.variants.get(variantId);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async findVariantBySku(
    workspaceId: string,
    skuCode: string
  ): Promise<CatalogVariantRecord | null> {
    const id = this.skuIndex.get(`${workspaceId}::${skuCode}`);
    if (!id) return null;
    const record = this.variants.get(id);
    return record ? clone(record) : null;
  }

  async listVariantsByProduct(
    workspaceId: string,
    productId: string
  ): Promise<CatalogVariantRecord[]> {
    const out: CatalogVariantRecord[] = [];
    for (const v of this.variants.values()) {
      if (v.workspaceId === workspaceId && v.productId === productId) {
        out.push(clone(v));
      }
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
  }

  async listVariantsByWorkspace(
    workspaceId: string
  ): Promise<CatalogVariantRecord[]> {
    const out: CatalogVariantRecord[] = [];
    for (const v of this.variants.values()) {
      if (v.workspaceId === workspaceId) out.push(clone(v));
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
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
    const record = this.variants.get(variantId);
    if (!record || record.workspaceId !== workspaceId) {
      throw catalogNotFound('Variant');
    }
    if (record.version !== expectedVersion) {
      throw catalogVersionConflict(record.version);
    }
    if (patch.skuCode !== undefined && patch.skuCode !== record.skuCode) {
      const clashId = this.skuIndex.get(`${workspaceId}::${patch.skuCode}`);
      if (clashId && clashId !== variantId) {
        const clash = this.variants.get(clashId);
        throw catalogConflict(
          `SKU code ${patch.skuCode} is already in use.`,
          clash
            ? {
                existingPath: this.variantPath(workspaceId, clash),
                existingVariantId: clash.id,
                existingProductId: clash.productId,
              }
            : undefined
        );
      }
      this.skuIndex.delete(`${workspaceId}::${record.skuCode}`);
      this.skuIndex.set(`${workspaceId}::${patch.skuCode}`, variantId);
    }
    const updated: CatalogVariantRecord = {
      ...clone(record),
      ...(patch.skuCode !== undefined ? { skuCode: patch.skuCode } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.barcode !== undefined ? { barcode: patch.barcode } : {}),
      ...(patch.sellingPriceCents !== undefined
        ? { sellingPriceCents: patch.sellingPriceCents }
        : {}),
      ...(patch.hppCents !== undefined ? { hppCents: patch.hppCents } : {}),
      ...(patch.costSource !== undefined
        ? { costSource: patch.costSource }
        : {}),
      ...(patch.listingName !== undefined
        ? { listingName: patch.listingName }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      version: record.version + 1,
      updatedAt: new Date(),
    };
    this.variants.set(variantId, updated);
    return clone(updated);
  }

  // Warehouses

  async createWarehouse(input: {
    workspaceId: string;
    code: string;
    name: string;
  }): Promise<WarehouseRecord> {
    const key = `${input.workspaceId}::${input.code}`;
    if (this.warehouseCodeIndex.has(key)) {
      throw catalogConflict(`Warehouse code ${input.code} is already in use.`);
    }
    const now = new Date();
    const record: WarehouseRecord = {
      id: this.nextId('wh'),
      workspaceId: input.workspaceId,
      code: input.code,
      name: input.name,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.warehouses.set(record.id, record);
    this.warehouseCodeIndex.set(key, record.id);
    return clone(record);
  }

  async findWarehouseById(
    workspaceId: string,
    warehouseId: string
  ): Promise<WarehouseRecord | null> {
    const record = this.warehouses.get(warehouseId);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async listWarehouses(workspaceId: string): Promise<WarehouseRecord[]> {
    const out: WarehouseRecord[] = [];
    for (const w of this.warehouses.values()) {
      if (w.workspaceId === workspaceId) out.push(clone(w));
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
  }

  async updateWarehouse(
    workspaceId: string,
    warehouseId: string,
    patch: { name?: string; status?: WarehouseStatus },
    expectedVersion: number
  ): Promise<WarehouseRecord> {
    const record = this.warehouses.get(warehouseId);
    if (!record || record.workspaceId !== workspaceId) {
      throw catalogNotFound('Warehouse');
    }
    if (record.version !== expectedVersion) {
      throw catalogVersionConflict(record.version);
    }
    const updated: WarehouseRecord = {
      ...record,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      version: record.version + 1,
      updatedAt: new Date(),
    };
    this.warehouses.set(warehouseId, updated);
    return clone(updated);
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
    // Idempotency first: a retried key resolves to the original result
    // without double-applying; a key reused with a different payload is
    // a 409 so misuse never silently merges two adjustments.
    if (
      input.idempotencyKey !== undefined &&
      input.idempotencyKey !== null &&
      input.idempotencyKey.length > 0
    ) {
      const seen = await this.findLedgerEntryByIdempotencyKey(
        input.workspaceId,
        input.idempotencyKey
      );
      if (seen) {
        if (
          seen.entry.variantId !== input.variantId ||
          seen.entry.warehouseId !== input.warehouseId ||
          seen.entry.delta !== input.delta ||
          seen.entry.reason !== input.reason
        ) {
          throw catalogConflict(
            'Idempotency key was already used for a different adjustment.'
          );
        }
        return seen;
      }
    }
    const key = `${input.variantId}::${input.warehouseId}`;
    const current = this.levels.get(key);
    if (current) {
      if (
        current.workspaceId !== input.workspaceId ||
        current.variantId !== input.variantId
      ) {
        throw catalogNotFound('Inventory level');
      }
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
    const now = new Date();
    const entry: StockLedgerRecord = {
      id: this.nextId('led'),
      workspaceId: input.workspaceId,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      delta: input.delta,
      balanceAfter: currentQty + input.delta,
      reason: input.reason,
      actorId: input.actorId,
      correlationId: input.correlationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: now,
    };
    this.ledger.push(entry);
    this.ledgerById.set(entry.id, entry);
    if (entry.idempotencyKey) {
      this.idempotencyIndex.set(
        `${input.workspaceId}::${entry.idempotencyKey}`,
        entry.id
      );
    }
    const level: InventoryLevelRecord = current
      ? {
          ...current,
          qty: currentQty + input.delta,
          version: current.version + 1,
          updatedAt: now,
        }
      : {
          id: this.nextId('lvl'),
          workspaceId: input.workspaceId,
          variantId: input.variantId,
          warehouseId: input.warehouseId,
          qty: input.delta,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
    this.levels.set(key, level);
    return { level: clone(level), entry: clone(entry) };
  }

  async findLedgerEntryByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<{ level: InventoryLevelRecord; entry: StockLedgerRecord } | null> {
    const entryId = this.idempotencyIndex.get(
      `${workspaceId}::${idempotencyKey}`
    );
    if (!entryId) return null;
    const entry = this.ledgerById.get(entryId);
    if (!entry || entry.workspaceId !== workspaceId) return null;
    const level = this.levels.get(`${entry.variantId}::${entry.warehouseId}`);
    if (!level) return null;
    return { level: clone(level), entry: clone(entry) };
  }

  async getLevel(
    workspaceId: string,
    variantId: string,
    warehouseId: string
  ): Promise<InventoryLevelRecord | null> {
    const record = this.levels.get(`${variantId}::${warehouseId}`);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async listLevelsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<InventoryLevelRecord[]> {
    const out: InventoryLevelRecord[] = [];
    for (const l of this.levels.values()) {
      if (l.workspaceId === workspaceId && l.variantId === variantId) {
        out.push(clone(l));
      }
    }
    return out;
  }

  async listLedgerByVariant(
    workspaceId: string,
    variantId: string,
    limit: number,
    filters?: { warehouseId?: string }
  ): Promise<StockLedgerRecord[]> {
    return (
      this.ledger
        .filter(
          (e) =>
            e.workspaceId === workspaceId &&
            e.variantId === variantId &&
            (filters?.warehouseId === undefined ||
              e.warehouseId === filters.warehouseId)
        )
        // Newest-first; ids are sequential so they break same-millisecond ties.
        .sort((a, b) => {
          const time = b.createdAt.getTime() - a.createdAt.getTime();
          return time !== 0 ? time : b.id.localeCompare(a.id);
        })
        .slice(0, Math.max(1, limit))
        .map(clone)
    );
  }

  async countMovements(
    workspaceId: string,
    variantId: string
  ): Promise<number> {
    let n = 0;
    for (const e of this.ledger) {
      if (e.workspaceId === workspaceId && e.variantId === variantId) n += 1;
    }
    return n;
  }

  async getStockSettings(workspaceId: string): Promise<StockSettingsRecord> {
    const existing = this.stockSettings.get(workspaceId);
    if (existing) return clone(existing);
    const now = new Date();
    const created: StockSettingsRecord = {
      workspaceId,
      allowNegative: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.stockSettings.set(workspaceId, created);
    return clone(created);
  }

  async updateStockSettings(
    workspaceId: string,
    patch: { allowNegative: boolean },
    expectedVersion: number
  ): Promise<StockSettingsRecord> {
    const current = await this.getStockSettings(workspaceId);
    if (current.version !== expectedVersion) {
      throw catalogVersionConflict(current.version);
    }
    const updated: StockSettingsRecord = {
      ...current,
      allowNegative: patch.allowNegative,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.stockSettings.set(workspaceId, updated);
    return clone(updated);
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
    const key = `${input.workspaceId}::${input.channel}::${input.shopExtId}::${input.platformSkuId}`;
    if (this.mappingKeyIndex.has(key)) {
      throw catalogConflict(
        'This channel listing is already mapped to a SKU TokoBoss.'
      );
    }
    const record: ChannelMappingRecord = {
      id: this.nextId('map'),
      workspaceId: input.workspaceId,
      variantId: input.variantId,
      channel: input.channel,
      shopExtId: input.shopExtId,
      platformSkuId: input.platformSkuId,
      sellerSkuHint: input.sellerSkuHint,
      barcodeHint: input.barcodeHint,
      listingName: input.listingName,
      createdAt: new Date(),
    };
    this.mappings.set(record.id, record);
    this.mappingKeyIndex.set(key, record.id);
    return clone(record);
  }

  async listMappingsByVariant(
    workspaceId: string,
    variantId: string
  ): Promise<ChannelMappingRecord[]> {
    const out: ChannelMappingRecord[] = [];
    for (const m of this.mappings.values()) {
      if (m.workspaceId === workspaceId && m.variantId === variantId) {
        out.push(clone(m));
      }
    }
    return out;
  }

  async listMappingsByWorkspace(
    workspaceId: string
  ): Promise<ChannelMappingRecord[]> {
    const out: ChannelMappingRecord[] = [];
    for (const m of this.mappings.values()) {
      if (m.workspaceId === workspaceId) out.push(clone(m));
    }
    return out;
  }

  async countMappings(workspaceId: string, variantId: string): Promise<number> {
    void workspaceId;
    let n = 0;
    for (const m of this.mappings.values()) {
      if (m.workspaceId === workspaceId && m.variantId === variantId) n += 1;
    }
    return n;
  }

  async deleteMapping(workspaceId: string, mappingId: string): Promise<void> {
    const record = this.mappings.get(mappingId);
    if (!record || record.workspaceId !== workspaceId) {
      throw catalogNotFound('Mapping');
    }
    this.mappings.delete(mappingId);
    this.mappingKeyIndex.delete(
      `${record.workspaceId}::${record.channel}::${record.shopExtId}::${record.platformSkuId}`
    );
  }

  // Bundle BOM (UTA-79, Story 13)

  private checkBundleVersion(
    workspaceId: string,
    bundleVariantId: string,
    expectedVersion: number
  ): CatalogVariantRecord {
    const bundle = this.variants.get(bundleVariantId);
    if (!bundle || bundle.workspaceId !== workspaceId) {
      throw catalogNotFound('Variant');
    }
    if (bundle.version !== expectedVersion) {
      throw bundleVersionConflict(bundle.version);
    }
    return bundle;
  }

  private bumpBundleVersion(
    bundle: CatalogVariantRecord
  ): CatalogVariantRecord {
    const bumped: CatalogVariantRecord = {
      ...bundle,
      version: bundle.version + 1,
      updatedAt: new Date(),
    };
    this.variants.set(bundle.id, bumped);
    return bumped;
  }

  async replaceBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    lines: NewBundleLineInput[],
    expectedVersion: number
  ): Promise<{ lines: BundleLineRecord[]; bundleVersion: number }> {
    const bundle = this.checkBundleVersion(
      workspaceId,
      bundleVariantId,
      expectedVersion
    );
    for (const [id, line] of this.bundleLines) {
      if (
        line.workspaceId === workspaceId &&
        line.bundleVariantId === bundleVariantId
      ) {
        this.bundleLines.delete(id);
      }
    }
    const now = new Date();
    const stored: BundleLineRecord[] = lines.map((l) => ({
      id: this.nextId('bom'),
      workspaceId,
      bundleVariantId,
      componentVariantId: l.componentVariantId,
      qty: l.qty,
      createdAt: now,
      updatedAt: now,
    }));
    for (const line of stored) {
      this.bundleLines.set(line.id, line);
    }
    const bumped = this.bumpBundleVersion(bundle);
    return { lines: stored.map(clone), bundleVersion: bumped.version };
  }

  async clearBundleLines(
    workspaceId: string,
    bundleVariantId: string,
    expectedVersion: number
  ): Promise<{ bundleVersion: number }> {
    const bundle = this.checkBundleVersion(
      workspaceId,
      bundleVariantId,
      expectedVersion
    );
    for (const [id, line] of this.bundleLines) {
      if (
        line.workspaceId === workspaceId &&
        line.bundleVariantId === bundleVariantId
      ) {
        this.bundleLines.delete(id);
      }
    }
    const bumped = this.bumpBundleVersion(bundle);
    return { bundleVersion: bumped.version };
  }

  async listBundleLines(
    workspaceId: string,
    bundleVariantId: string
  ): Promise<BundleLineRecord[]> {
    const out: BundleLineRecord[] = [];
    for (const line of this.bundleLines.values()) {
      if (
        line.workspaceId === workspaceId &&
        line.bundleVariantId === bundleVariantId
      ) {
        out.push(clone(line));
      }
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
  }

  async listBundlesByWorkspace(
    workspaceId: string
  ): Promise<BundleLineRecord[]> {
    const out: BundleLineRecord[] = [];
    for (const line of this.bundleLines.values()) {
      if (line.workspaceId === workspaceId) out.push(clone(line));
    }
    out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return out;
  }

  async listBundlesUsingComponent(
    workspaceId: string,
    componentVariantId: string
  ): Promise<BundleLineRecord[]> {
    const out: BundleLineRecord[] = [];
    for (const line of this.bundleLines.values()) {
      if (
        line.workspaceId === workspaceId &&
        line.componentVariantId === componentVariantId
      ) {
        out.push(clone(line));
      }
    }
    return out;
  }

  async isBundleVariant(
    workspaceId: string,
    variantId: string
  ): Promise<boolean> {
    for (const line of this.bundleLines.values()) {
      if (
        line.workspaceId === workspaceId &&
        line.bundleVariantId === variantId
      ) {
        return true;
      }
    }
    return false;
  }
}
