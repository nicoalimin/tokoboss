/**
 * Browser client for the UTA-75 catalog Route Handlers (UTA-76, Story 01 web).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`), so no tokens, workspace secrets, or PII are kept in JS
 *   variables, browser storage, or logs.
 * - Errors are normalized to client-safe messages via `getCatalogCopy`:
 *   server messages pass through only for duplicate-SKU guidance (the
 *   existing product path is an opaque route, never raw ids); everything
 *   else maps to generic copy. Thrown errors never echo SKUs, barcodes,
 *   reasons, or ids.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth).
 */

import { getCatalogCopy, type CatalogLang } from './catalog-copy';

export interface ProductPicture {
  fileId: string;
  sortOrder: number;
}

export interface InventoryLevelView {
  variantId: string;
  warehouseId: string;
  qty: number;
  version: number;
  updatedAt: string;
}

export interface ChannelMappingView {
  id: string;
  workspaceId: string;
  variantId: string;
  channel: string;
  shopExtId: string;
  platformSkuId: string;
  sellerSkuHint: string | null;
  barcodeHint: string | null;
  listingName: string | null;
  createdAt: string;
}

export interface VariantView {
  id: string;
  workspaceId: string;
  productId: string;
  skuCode: string;
  name: string | null;
  barcode: string | null;
  sellingPriceCents: number;
  currency: string;
  hppCents: number | null;
  costSource: string | null;
  listingName: string | null;
  status: 'active' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
  levels?: InventoryLevelView[];
  mappings?: ChannelMappingView[];
}

export interface ProductView {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  unit: string;
  pictures: ProductPicture[];
  status: 'active' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
  variants?: VariantView[];
}

export interface WarehouseView {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  status: 'active' | 'deactivated';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryView {
  id: string;
  workspaceId: string;
  variantId: string;
  warehouseId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  actorId: string | null;
  correlationId: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
}

export interface WarehouseBalanceView {
  warehouseId: string;
  qty: number;
  version: number;
}

export interface StockBalanceView {
  variantId: string;
  workspaceId: string;
  totalQty: number;
  perWarehouse: WarehouseBalanceView[];
}

export interface StockSettingsView {
  workspaceId: string;
  allowNegative: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  unit?: string;
  variants: Array<{
    skuCode: string;
    name?: string;
    sellingPriceCents: number;
  }>;
}

export interface UpdateProductInput {
  name?: string;
  unit?: string;
  pictures?: ProductPicture[];
  expectedVersion: number;
}

export interface UpdateVariantInput {
  skuCode?: string;
  name?: string | null;
  barcode?: string | null;
  sellingPriceCents?: number;
  hppCents?: number | null;
  costSource?: string | null;
  listingName?: string | null;
  expectedVersion: number;
}

export interface AdjustStockInput {
  warehouseId: string;
  delta: number;
  reason: string;
  expectedVersion?: number;
  /** Client-generated retry key; retries resolve without double-apply. */
  idempotencyKey?: string;
}

export class CatalogClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  /** Opaque existing-product route for duplicate SKUs (409 only). */
  readonly existingPath?: string;
  constructor(opts: {
    status: number;
    errorCode: string;
    message: string;
    needsReauth?: boolean;
    existingPath?: string;
  }) {
    super(opts.message);
    this.name = 'CatalogClientError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.needsReauth = opts.needsReauth ?? false;
    this.existingPath = opts.existingPath;
  }
}

type FetchFn = typeof fetch;

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === 'object')
      return data as Record<string, unknown>;
  } catch {
    // Non-JSON (proxies, empty 500s) → generic handling below.
  }
  return {};
}

function detailsRecord(body: Record<string, unknown>): Record<string, unknown> {
  const details = body['details'];
  return details && typeof details === 'object'
    ? (details as Record<string, unknown>)
    : {};
}

/** Map a failing response to a client-safe error (never echoes PII/SKUs). */
export function toCatalogClientError(
  status: number,
  body: Record<string, unknown>,
  lang: CatalogLang = 'en'
): CatalogClientError {
  const copy = getCatalogCopy(lang);
  const code =
    typeof body['errorCode'] === 'string'
      ? body['errorCode']
      : 'CATALOG_FAILED';
  if (status === 401) {
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: code === 'INVALID_SESSION',
    });
  }
  if (status === 403) {
    return new CatalogClientError({
      status,
      errorCode: 'TENANCY_FORBIDDEN',
      message: copy.forbiddenError,
    });
  }
  if (status === 409 && code === 'CATALOG_CONFLICT') {
    const existingPath = detailsRecord(body)['existingPath'];
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.duplicateError,
      ...(typeof existingPath === 'string' && existingPath.startsWith('/api/')
        ? { existingPath }
        : {}),
    });
  }
  if (status === 409 && code === 'CATALOG_VERSION_CONFLICT') {
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.versionConflictError,
    });
  }
  if (status === 422 && code === 'CATALOG_SKU_LOCKED') {
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.lockError,
    });
  }
  if (status === 422 && code === 'BUNDLE_NO_DIRECT_STOCK') {
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.bundleStockError,
    });
  }
  if (status === 400 || status === 422) {
    return new CatalogClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new CatalogClientError({
    status,
    errorCode: code,
    message: copy.genericError,
  });
}

async function getJson<T>(
  fetchFn: FetchFn,
  path: string,
  lang: CatalogLang
): Promise<T> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  if (!res.ok)
    throw toCatalogClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendJson<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  payload: unknown,
  lang: CatalogLang
): Promise<T> {
  const res = await fetchFn(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw toCatalogClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

function base(workspaceId: string): string {
  return `/api/workspaces/${encodeSegment(workspaceId)}/catalog`;
}

export interface ClientOpts {
  fetchFn?: FetchFn;
  lang?: CatalogLang;
}

/** List products with variants (any active member; `q` searches all ids). */
export async function listProducts(
  workspaceId: string,
  query?: { q?: string; status?: 'active' | 'archived' },
  opts: ClientOpts = {}
): Promise<ProductView[]> {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set('q', query.q.trim());
  if (query?.status) params.set('status', query.status);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const data = await getJson<{ products?: ProductView[] }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/products${suffix}`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.products) ? data.products : [];
}

/** Cross-identifier search (name / SKU / barcode / Store SKU / listing). */
export async function searchCatalog(
  workspaceId: string,
  q: string,
  opts: ClientOpts = {}
): Promise<{ products: ProductView[]; variants: VariantView[] }> {
  const data = await getJson<{
    products?: ProductView[];
    variants?: VariantView[];
  }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/search?q=${encodeURIComponent(q)}`,
    opts.lang ?? 'en'
  );
  return {
    products: Array.isArray(data.products) ? data.products : [],
    variants: Array.isArray(data.variants) ? data.variants : [],
  };
}

/** Product detail with variant levels + Store mappings (drawer source). */
export async function getProductDetail(
  workspaceId: string,
  productId: string,
  opts: ClientOpts = {}
): Promise<ProductView> {
  const data = await getJson<{ product: ProductView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/products/${encodeSegment(productId)}`,
    opts.lang ?? 'en'
  );
  return data.product;
}

/** Create a product with ≥1 variants (Manager/Admin). */
export async function createProduct(
  workspaceId: string,
  input: CreateProductInput,
  opts: ClientOpts = {}
): Promise<ProductView> {
  const data = await sendJson<{ product: ProductView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/products`,
    'POST',
    {
      name: input.name,
      unit: input.unit ?? 'pcs',
      variants: input.variants,
    },
    opts.lang ?? 'en'
  );
  return data.product;
}

/** Update product-level fields (Manager/Admin; version-gated). */
export async function updateProduct(
  workspaceId: string,
  productId: string,
  input: UpdateProductInput,
  opts: ClientOpts = {}
): Promise<ProductView> {
  const data = await sendJson<{ product: ProductView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/products/${encodeSegment(productId)}`,
    'PATCH',
    input,
    opts.lang ?? 'en'
  );
  return data.product;
}

/** Archive a product + variants (Manager/Admin; no hard delete). */
export async function archiveProduct(
  workspaceId: string,
  productId: string,
  opts: ClientOpts = {}
): Promise<ProductView> {
  const data = await sendJson<{ product: ProductView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/products/${encodeSegment(productId)}/archive`,
    'POST',
    {},
    opts.lang ?? 'en'
  );
  return data.product;
}

/** Variant detail with levels + mappings (drawer source for one SKU). */
export async function getVariant(
  workspaceId: string,
  variantId: string,
  opts: ClientOpts = {}
): Promise<VariantView> {
  const data = await getJson<{ variant: VariantView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/variants/${encodeSegment(variantId)}`,
    opts.lang ?? 'en'
  );
  return data.variant;
}

/** Update variant fields (Manager/Admin; SKU code Admin-only + lockable). */
export async function updateVariant(
  workspaceId: string,
  variantId: string,
  input: UpdateVariantInput,
  opts: ClientOpts = {}
): Promise<VariantView> {
  const data = await sendJson<{ variant: VariantView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/variants/${encodeSegment(variantId)}`,
    'PATCH',
    input,
    opts.lang ?? 'en'
  );
  return data.variant;
}

/**
 * Warehouse adjustment: warehouse + non-zero delta + reason are all
 * required client-side (the server re-enforces). Manager/Admin only
 * (UTA-81); the server stays the boundary.
 */
export async function adjustStock(
  workspaceId: string,
  variantId: string,
  input: AdjustStockInput,
  opts: ClientOpts = {}
): Promise<{
  level: InventoryLevelView;
  entry: LedgerEntryView;
  deduplicated?: boolean;
}> {
  return sendJson<{
    level: InventoryLevelView;
    entry: LedgerEntryView;
    deduplicated?: boolean;
  }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/variants/${encodeSegment(variantId)}/adjustments`,
    'POST',
    {
      warehouseId: input.warehouseId,
      delta: input.delta,
      reason: input.reason,
      ...(input.expectedVersion !== undefined
        ? { expectedVersion: input.expectedVersion }
        : {}),
      ...(input.idempotencyKey !== undefined
        ? { idempotencyKey: input.idempotencyKey }
        : {}),
    },
    opts.lang ?? 'en'
  );
}

/** Ledger entries for a variant (the stock source of truth). */
export async function getLedger(
  workspaceId: string,
  variantId: string,
  opts: ClientOpts & { warehouseId?: string; limit?: number } = {}
): Promise<LedgerEntryView[]> {
  const params = new URLSearchParams();
  if (opts.warehouseId) params.set('warehouseId', opts.warehouseId);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const data = await getJson<{ entries?: LedgerEntryView[] }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/variants/${encodeSegment(variantId)}/ledger${query}`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

/**
 * Consolidated + per-warehouse remaining for one SKU TokoBoss
 * (UTA-81 read API for the multi-warehouse UX).
 */
export async function getStockBalance(
  workspaceId: string,
  variantId: string,
  opts: ClientOpts = {}
): Promise<StockBalanceView> {
  const data = await getJson<{ balance: StockBalanceView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/variants/${encodeSegment(variantId)}/stock`,
    opts.lang ?? 'en'
  );
  return data.balance;
}

/** Workspace stock policy (negative-stock toggle, default OFF). */
export async function getStockSettings(
  workspaceId: string,
  opts: ClientOpts = {}
): Promise<StockSettingsView> {
  const data = await getJson<{ settings: StockSettingsView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/stock-settings`,
    opts.lang ?? 'en'
  );
  return data.settings;
}

/** Warehouses for the adjustment picker (any active member). */
export async function listWarehouses(
  workspaceId: string,
  opts: ClientOpts = {}
): Promise<WarehouseView[]> {
  const data = await getJson<{ warehouses?: WarehouseView[] }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/warehouses`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.warehouses) ? data.warehouses : [];
}

/** Format integer cents as whole IDR (no floats cross this boundary). */
export function formatIdr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `Rp${cents.toLocaleString('id-ID')}`;
}

/** Sum variant levels into a product total for the dense list. */
export function totalQty(variant: VariantView): number {
  return (variant.levels ?? []).reduce((sum, l) => sum + l.qty, 0);
}

export function productTotalQty(product: ProductView): number {
  return (product.variants ?? []).reduce((sum, v) => sum + totalQty(v), 0);
}

/** First SKU TokoBoss of a product (visually primary in list + drawer). */
export function primarySku(product: ProductView): string {
  return product.variants?.[0]?.skuCode ?? '—';
}
