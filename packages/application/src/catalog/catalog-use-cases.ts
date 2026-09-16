import {
  BusinessRuleViolationError,
  CatalogRules,
  SkuCode,
} from '@tokoboss/domain';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
  assertWarehouseAccess,
} from '../tenancy/workspace-context';
import {
  catalogConflict,
  catalogForbidden,
  catalogInsufficientStock,
  catalogNotFound,
  catalogSkuLocked,
  catalogValidation,
  catalogWarehouseInactive,
} from './catalog-errors';
import type { CatalogStore } from './catalog-ports';
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
 * Catalog use-cases (UTA-75, Story 01).
 *
 * Every use-case takes the path `workspaceId` explicitly and asserts it
 * against the server-resolved `ctx` (never trusts client claims).
 * RBAC: reads need active membership; writes need Manager/Admin except
 * stock adjustments (any active member within warehouse scope) and SKU
 * code edits (Admin only, locked after movements/mappings).
 */

// Validation (shared shape with the zod wire contracts; enforced again here
// so stores stay usable without HTTP).

function cleanText(
  value: unknown,
  field: string,
  max: number,
  opts: { min?: number } = {}
): string {
  const min = opts.min ?? 1;
  if (typeof value !== 'string' || value.trim().length < min) {
    throw catalogValidation(`${field} must not be empty`);
  }
  const v = value.trim();
  if (v.length > max) {
    throw catalogValidation(`${field} must be at most ${max} characters`);
  }
  return v;
}

function cleanNullableText(
  value: unknown,
  field: string,
  max: number
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return cleanText(value, field, max);
}

function cleanPriceCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw catalogValidation(`${field} must be a non-negative integer`);
  }
  return value;
}

function cleanSku(value: unknown): string {
  try {
    return SkuCode.parse(value).value;
  } catch (err) {
    throw catalogValidation(
      err instanceof Error ? err.message : 'SKU code is invalid'
    );
  }
}

const WAREHOUSE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_]*$/;

function cleanWarehouseCode(value: unknown): string {
  const v = cleanText(value, 'Warehouse code', 64);
  if (!WAREHOUSE_CODE_PATTERN.test(v)) {
    throw catalogValidation('Warehouse code has an unsupported format');
  }
  return v;
}

function cleanCurrency(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'IDR';
  if (typeof value !== 'string' || value.trim().length !== 3) {
    throw catalogValidation('Currency must be a 3-letter code');
  }
  return value.trim().toUpperCase();
}

function cleanPictures(value: unknown): ProductPicture[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw catalogValidation('Pictures must be an array of at most 10');
  }
  return value.map((p) => {
    if (typeof p !== 'object' || p === null) {
      throw catalogValidation('Picture must be an object');
    }
    const rec = p as Record<string, unknown>;
    const fileId = cleanText(rec['fileId'], 'Picture fileId', 200);
    const sortOrder = rec['sortOrder'];
    if (
      typeof sortOrder !== 'number' ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      throw catalogValidation(
        'Picture sortOrder must be a non-negative integer'
      );
    }
    return { fileId, sortOrder };
  });
}

interface ValidatedVariant {
  skuCode: string;
  name: string | null;
  barcode: string | null;
  sellingPriceCents: number;
  currency: string;
  hppCents: number | null;
  costSource: string | null;
  listingName: string | null;
}

function validateVariantInput(raw: unknown): ValidatedVariant {
  if (typeof raw !== 'object' || raw === null) {
    throw catalogValidation('Variant must be an object');
  }
  const v = raw as Record<string, unknown>;
  const barcode = cleanNullableText(v['barcode'], 'Barcode', 64);
  const hppRaw = v['hppCents'];
  let hppCents: number | null = null;
  if (hppRaw !== undefined && hppRaw !== null) {
    hppCents = cleanPriceCents(hppRaw, 'HPP');
  }
  const name = cleanNullableText(v['name'], 'Variant name', 200);
  return {
    skuCode: cleanSku(v['skuCode']),
    name: name ?? null,
    barcode: barcode ?? null,
    sellingPriceCents: cleanPriceCents(v['sellingPriceCents'], 'Selling price'),
    currency: cleanCurrency(v['currency']),
    hppCents,
    costSource: cleanNullableText(v['costSource'], 'Cost source', 120) ?? null,
    listingName:
      cleanNullableText(v['listingName'], 'Listing name', 200) ?? null,
  };
}

function toNewVariantInput(v: ValidatedVariant): NewVariantInput {
  return {
    skuCode: v.skuCode,
    name: v.name,
    barcode: v.barcode,
    sellingPriceCents: v.sellingPriceCents,
    currency: v.currency,
    hppCents: v.hppCents,
    costSource: v.costSource,
    listingName: v.listingName,
  };
}

// Warehouses

export async function createWarehouse(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    code: unknown;
    name: unknown;
  }
): Promise<WarehouseRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  return store.createWarehouse({
    workspaceId: input.workspaceId,
    code: cleanWarehouseCode(input.code),
    name: cleanText(input.name, 'Warehouse name', 200),
  });
}

export async function listWarehouses(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string }
): Promise<WarehouseRecord[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  return store.listWarehouses(input.workspaceId);
}

export async function updateWarehouse(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    warehouseId: string;
    name?: unknown;
    status?: unknown;
    expectedVersion: number;
  }
): Promise<WarehouseRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const patch: { name?: string; status?: WarehouseStatus } = {};
  if (input.name !== undefined) {
    patch.name = cleanText(input.name, 'Warehouse name', 200);
  }
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'deactivated') {
      throw catalogValidation('Status must be active or deactivated');
    }
    patch.status = input.status;
  }
  if (patch.name === undefined && patch.status === undefined) {
    throw catalogValidation('Nothing to update.');
  }
  return store.updateWarehouse(
    input.workspaceId,
    input.warehouseId,
    patch,
    input.expectedVersion
  );
}

// Products

export interface ProductWithVariants {
  product: CatalogProductRecord;
  variants: CatalogVariantRecord[];
}

export interface ProductDetailVariant {
  variant: CatalogVariantRecord;
  levels: InventoryLevelRecord[];
  mappings: ChannelMappingRecord[];
}

export interface ProductDetail {
  product: CatalogProductRecord;
  variants: ProductDetailVariant[];
}

export async function createProduct(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    name: unknown;
    description?: unknown;
    unit?: unknown;
    pictures?: unknown;
    variants: unknown;
  }
): Promise<ProductWithVariants> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    throw catalogValidation('A product needs at least one variant');
  }
  if (input.variants.length > 100) {
    throw catalogValidation('A product holds at most 100 variants');
  }
  const variants = input.variants.map(validateVariantInput);
  const seen = new Set<string>();
  for (const v of variants) {
    if (seen.has(v.skuCode)) {
      throw catalogConflict(`SKU code ${v.skuCode} is duplicated.`);
    }
    seen.add(v.skuCode);
  }
  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    description = cleanText(input.description, 'Description', 2000);
  }
  return store.createProductWithVariants({
    workspaceId: input.workspaceId,
    name: cleanText(input.name, 'Product name', 200),
    description,
    unit:
      input.unit === undefined || input.unit === null || input.unit === ''
        ? 'pcs'
        : cleanText(input.unit, 'Unit', 24),
    pictures: cleanPictures(input.pictures),
    variants: variants.map(toNewVariantInput),
  });
}

export async function getProductDetail(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; productId: string }
): Promise<ProductDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const product = await store.findProductById(
    input.workspaceId,
    input.productId
  );
  if (!product) throw catalogNotFound('Product');
  const variants = await store.listVariantsByProduct(
    input.workspaceId,
    input.productId
  );
  const detail: ProductDetailVariant[] = [];
  for (const variant of variants) {
    detail.push({
      variant,
      levels: await store.listLevelsByVariant(input.workspaceId, variant.id),
      mappings: await store.listMappingsByVariant(
        input.workspaceId,
        variant.id
      ),
    });
  }
  return { product, variants: detail };
}

export async function listProducts(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    q?: string;
    status?: CatalogStatus;
    limit?: number;
  }
): Promise<ProductWithVariants[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const products = await store.listProducts(input.workspaceId);
  const allVariants = await store.listVariantsByWorkspace(input.workspaceId);
  const byProduct = new Map<string, CatalogVariantRecord[]>();
  for (const v of allVariants) {
    const list = byProduct.get(v.productId) ?? [];
    list.push(v);
    byProduct.set(v.productId, list);
  }
  let mappings: ChannelMappingRecord[] = [];
  const q = (input.q ?? '').trim().toLowerCase();
  if (q.length > 0) {
    mappings = await store.listMappingsByWorkspace(input.workspaceId);
  }
  const out: ProductWithVariants[] = [];
  for (const product of products) {
    if (input.status && product.status !== input.status) continue;
    const variants = byProduct.get(product.id) ?? [];
    if (q.length > 0 && !productMatchesQuery(product, variants, mappings, q)) {
      continue;
    }
    out.push({ product, variants });
    if (out.length >= limit) break;
  }
  return out;
}

export async function updateProduct(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    productId: string;
    name?: unknown;
    description?: unknown;
    unit?: unknown;
    pictures?: unknown;
    expectedVersion: number;
  }
): Promise<CatalogProductRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const patch: {
    name?: string;
    description?: string | null;
    unit?: string;
    pictures?: ProductPicture[];
  } = {};
  if (input.name !== undefined) {
    patch.name = cleanText(input.name, 'Product name', 200);
  }
  if (input.description !== undefined) {
    patch.description =
      input.description === null
        ? null
        : cleanText(input.description, 'Description', 2000);
  }
  if (input.unit !== undefined) {
    patch.unit = cleanText(input.unit, 'Unit', 24);
  }
  if (input.pictures !== undefined) {
    patch.pictures = cleanPictures(input.pictures);
  }
  if (Object.keys(patch).length === 0) {
    throw catalogValidation('Nothing to update.');
  }
  return store.updateProduct(
    input.workspaceId,
    input.productId,
    patch,
    input.expectedVersion
  );
}

/**
 * Archive a product (idempotent soft-delete). Active variants archive
 * alongside it in one atomic store unit of work so list views stay
 * consistent; stock history is untouched.
 */
export async function archiveProduct(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; productId: string }
): Promise<CatalogProductRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const product = await store.findProductById(
    input.workspaceId,
    input.productId
  );
  if (!product) throw catalogNotFound('Product');
  if (product.status === 'archived') return product;
  return store.archiveProductCascade(
    input.workspaceId,
    product.id,
    product.version
  );
}

// Variants

export async function createVariant(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    productId: string;
    variant: unknown;
  }
): Promise<CatalogVariantRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const product = await store.findProductById(
    input.workspaceId,
    input.productId
  );
  if (!product) throw catalogNotFound('Product');
  if (product.status !== 'active') {
    throw catalogValidation('Cannot add variants to an archived product.');
  }
  const validated = validateVariantInput(input.variant);
  return store.createVariant(
    input.workspaceId,
    input.productId,
    toNewVariantInput(validated)
  );
}

export async function getVariant(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; variantId: string }
): Promise<ProductDetailVariant> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  return {
    variant,
    levels: await store.listLevelsByVariant(input.workspaceId, variant.id),
    mappings: await store.listMappingsByVariant(input.workspaceId, variant.id),
  };
}

export async function updateVariant(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    variantId: string;
    skuCode?: unknown;
    name?: unknown;
    barcode?: unknown;
    sellingPriceCents?: unknown;
    hppCents?: unknown;
    costSource?: unknown;
    listingName?: unknown;
    expectedVersion: number;
  }
): Promise<CatalogVariantRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const current = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!current) throw catalogNotFound('Variant');
  const patch: {
    skuCode?: string;
    name?: string | null;
    barcode?: string | null;
    sellingPriceCents?: number;
    hppCents?: number | null;
    costSource?: string | null;
    listingName?: string | null;
  } = {};
  if (input.skuCode !== undefined) {
    const next = cleanSku(input.skuCode);
    if (next !== current.skuCode) {
      const movements = await store.countMovements(
        input.workspaceId,
        input.variantId
      );
      const mappings = await store.countMappings(
        input.workspaceId,
        input.variantId
      );
      try {
        CatalogRules.assertSkuCodeChangeAllowed({
          isAdmin: input.ctx.role === 'admin',
          movementCount: movements,
          mappingCount: mappings,
        });
      } catch (err) {
        if (err instanceof BusinessRuleViolationError) {
          if (err.message.includes('Only Admin')) {
            throw catalogForbidden('Only Admin may edit SKU codes');
          }
          throw catalogSkuLocked(err.message);
        }
        throw err;
      }
      patch.skuCode = next;
    }
  }
  if (input.name !== undefined) {
    patch.name = cleanNullableText(input.name, 'Variant name', 200) ?? null;
  }
  if (input.barcode !== undefined) {
    patch.barcode = cleanNullableText(input.barcode, 'Barcode', 64) ?? null;
  }
  if (input.sellingPriceCents !== undefined) {
    patch.sellingPriceCents = cleanPriceCents(
      input.sellingPriceCents,
      'Selling price'
    );
  }
  if (input.hppCents !== undefined) {
    patch.hppCents =
      input.hppCents === null ? null : cleanPriceCents(input.hppCents, 'HPP');
  }
  if (input.costSource !== undefined) {
    patch.costSource =
      cleanNullableText(input.costSource, 'Cost source', 120) ?? null;
  }
  if (input.listingName !== undefined) {
    patch.listingName =
      cleanNullableText(input.listingName, 'Listing name', 200) ?? null;
  }
  if (Object.keys(patch).length === 0) {
    throw catalogValidation('Nothing to update.');
  }
  return store.updateVariant(
    input.workspaceId,
    input.variantId,
    patch,
    input.expectedVersion
  );
}

/** Archive a variant (idempotent soft-delete). */
export async function archiveVariant(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; variantId: string }
): Promise<CatalogVariantRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  if (variant.status === 'archived') return variant;
  return store.updateVariant(
    input.workspaceId,
    variant.id,
    { status: 'archived' },
    variant.version
  );
}

// Stock

export interface AdjustmentResult {
  level: InventoryLevelRecord;
  entry: StockLedgerRecord;
}

export async function adjustStock(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    variantId: string;
    warehouseId: unknown;
    delta: unknown;
    reason: unknown;
    expectedVersion?: number;
    correlationId?: string;
  }
): Promise<AdjustmentResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  if (variant.status !== 'active') {
    throw catalogValidation('Variant is archived.');
  }
  const warehouseId =
    typeof input.warehouseId === 'string' ? input.warehouseId.trim() : '';
  if (warehouseId.length === 0) {
    throw catalogValidation('A warehouse is required');
  }
  const warehouse = await store.findWarehouseById(
    input.workspaceId,
    warehouseId
  );
  if (!warehouse) throw catalogNotFound('Warehouse');
  // Scoped roles may only touch their assigned warehouse.
  assertWarehouseAccess(input.ctx, warehouse.id);
  const delta = input.delta;
  const reason = typeof input.reason === 'string' ? input.reason : '';
  if (reason.trim().length > 500) {
    throw catalogValidation('Reason must be at most 500 characters');
  }
  try {
    CatalogRules.assertAdjustmentAllowed({
      delta: typeof delta === 'number' ? delta : Number.NaN,
      reason,
      warehouseActive: warehouse.status === 'active',
    });
  } catch (err) {
    if (err instanceof BusinessRuleViolationError) {
      if (err.message.includes('deactivated')) {
        throw catalogWarehouseInactive();
      }
      throw catalogValidation(err.message);
    }
    throw err;
  }
  if (typeof delta !== 'number' || !Number.isInteger(delta)) {
    throw catalogValidation('Delta must be a non-zero integer');
  }
  try {
    return await store.adjustLevel({
      workspaceId: input.workspaceId,
      variantId: variant.id,
      warehouseId: warehouse.id,
      delta,
      reason: reason.trim(),
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      expectedVersion: input.expectedVersion,
    });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'CATALOG_INSUFFICIENT_STOCK'
    ) {
      throw catalogInsufficientStock();
    }
    throw err;
  }
}

export async function getLedger(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    variantId: string;
    limit?: number;
  }
): Promise<StockLedgerRecord[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  return store.listLedgerByVariant(
    input.workspaceId,
    variant.id,
    Math.min(Math.max(input.limit ?? 50, 1), 100)
  );
}

// Channel mappings

export async function createMapping(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    variantId: string;
    channel: unknown;
    shopExtId: unknown;
    platformSkuId: unknown;
    sellerSkuHint?: unknown;
    barcodeHint?: unknown;
    listingName?: unknown;
  }
): Promise<ChannelMappingRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  return store.createMapping({
    workspaceId: input.workspaceId,
    variantId: variant.id,
    channel: cleanText(input.channel, 'Channel', 40),
    shopExtId: cleanText(input.shopExtId, 'Shop id', 200),
    platformSkuId: cleanText(input.platformSkuId, 'Platform SKU id', 200),
    sellerSkuHint:
      input.sellerSkuHint === undefined
        ? null
        : (cleanNullableText(input.sellerSkuHint, 'Seller SKU hint', 200) ??
          null),
    barcodeHint:
      input.barcodeHint === undefined
        ? null
        : (cleanNullableText(input.barcodeHint, 'Barcode hint', 64) ?? null),
    listingName:
      input.listingName === undefined
        ? null
        : (cleanNullableText(input.listingName, 'Listing name', 200) ?? null),
  });
}

export async function listMappings(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; variantId: string }
): Promise<ChannelMappingRecord[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const variant = await store.findVariantById(
    input.workspaceId,
    input.variantId
  );
  if (!variant) throw catalogNotFound('Variant');
  return store.listMappingsByVariant(input.workspaceId, variant.id);
}

export async function deleteMapping(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; mappingId: string }
): Promise<void> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  return store.deleteMapping(input.workspaceId, input.mappingId);
}

// Search

function haystack(parts: Array<string | null>): string {
  return parts
    .filter((p): p is string => typeof p === 'string')
    .join(' \u0000 ')
    .toLowerCase();
}

function productMatchesQuery(
  product: CatalogProductRecord,
  variants: CatalogVariantRecord[],
  mappings: ChannelMappingRecord[],
  q: string
): boolean {
  if (product.name.toLowerCase().includes(q)) return true;
  const variantIds = new Set(variants.map((v) => v.id));
  for (const v of variants) {
    if (haystack([v.skuCode, v.name, v.barcode, v.listingName]).includes(q)) {
      return true;
    }
  }
  for (const m of mappings) {
    if (!variantIds.has(m.variantId)) continue;
    if (
      haystack([
        m.sellerSkuHint,
        m.barcodeHint,
        m.listingName,
        m.platformSkuId,
      ]).includes(q)
    ) {
      return true;
    }
  }
  return false;
}

export interface VariantSearchHit {
  variant: CatalogVariantRecord;
  productId: string;
  productName: string;
}

export interface CatalogSearchResult {
  products: ProductWithVariants[];
  variants: VariantSearchHit[];
}

/**
 * Story 01 search: one query across product name, SKU TokoBoss,
 * barcode, Store SKU hint (`sellerSkuHint` / `platformSkuId`), and
 * listing name (variant + mapping). Case-insensitive substring.
 */
export async function searchCatalog(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    q: unknown;
    limit?: number;
  }
): Promise<CatalogSearchResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const q = typeof input.q === 'string' ? input.q.trim().toLowerCase() : '';
  if (q.length === 0) throw catalogValidation('Search query must not be empty');
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const products = await store.listProducts(input.workspaceId);
  const allVariants = await store.listVariantsByWorkspace(input.workspaceId);
  const mappings = await store.listMappingsByWorkspace(input.workspaceId);
  const byProduct = new Map<string, CatalogVariantRecord[]>();
  for (const v of allVariants) {
    const list = byProduct.get(v.productId) ?? [];
    list.push(v);
    byProduct.set(v.productId, list);
  }
  const matchedProducts: ProductWithVariants[] = [];
  const matchedVariants: VariantSearchHit[] = [];
  for (const product of products) {
    const variants = byProduct.get(product.id) ?? [];
    if (!productMatchesQuery(product, variants, mappings, q)) continue;
    matchedProducts.push({ product, variants });
    for (const variant of variants) {
      const variantHit =
        haystack([
          variant.skuCode,
          variant.name,
          variant.barcode,
          variant.listingName,
        ]).includes(q) ||
        mappings.some(
          (m) =>
            m.variantId === variant.id &&
            haystack([
              m.sellerSkuHint,
              m.barcodeHint,
              m.listingName,
              m.platformSkuId,
            ]).includes(q)
        );
      if (variantHit && matchedVariants.length < limit) {
        matchedVariants.push({
          variant,
          productId: product.id,
          productName: product.name,
        });
      }
    }
    if (matchedProducts.length >= limit) break;
  }
  return { products: matchedProducts, variants: matchedVariants };
}
