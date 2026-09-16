/**
 * Catalog infrastructure wiring for Route Handlers (UTA-75, Story 01).
 *
 * - Stores mirror `@/lib/auth`: Postgres (`DATABASE_URL` set) through
 *   `DrizzleCatalogStore`, otherwise a process-local `InMemoryCatalogStore`
 *   (local-dev/fixture mode; responses include `storage: "memory"`).
 * - Authorization is server-side only: `requireWorkspaceMember` validates
 *   the session token, then resolves the caller's membership from the
 *   member store keyed by the authenticated user id + the path workspace
 *   id. Client-supplied roles are never trusted (deny-by-default).
 *   Write gates (`requireManagerOrAdmin`) layer on top; the use-cases
 *   re-assert every rule so the HTTP layer is never the only check.
 * - Secrets/PII discipline: no tokens, hashes, or emails flow through
 *   catalog — log references (product/variant/ledger ids) only.
 */
import {
  DrizzleCatalogStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryCatalogStore,
  toContext,
  type CatalogStore,
  type ChannelMappingRecord,
  type CatalogProductRecord,
  type CatalogVariantRecord,
  type InventoryLevelRecord,
  type ProductDetail,
  type ProductDetailVariant,
  type ProductPicture,
  type ProductWithVariants,
  type StockLedgerRecord,
  type WarehouseRecord,
  type WorkspaceContext,
} from '@tokoboss/application';
import type {
  ChannelMappingView,
  InventoryLevelView,
  LedgerEntryView,
  ProductView,
  VariantView,
  WarehouseView,
} from '@tokoboss/contracts';
import {
  getMemberStore,
  requireSessionToken,
  slideSessionCookie,
  storageKind,
  type ValidatedRequest,
} from '@/lib/auth';

export { storageKind } from '@/lib/auth';

let dbHandle: DbHandle | null = null;
let memoryCatalog: InMemoryCatalogStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

function getMemoryCatalog(): InMemoryCatalogStore {
  if (!memoryCatalog) memoryCatalog = new InMemoryCatalogStore();
  return memoryCatalog;
}

export function getCatalogStore(): CatalogStore {
  if (storageKind() === 'postgres') {
    return new DrizzleCatalogStore(getDbHandle().db);
  }
  return getMemoryCatalog();
}

/**
 * Reset process-local catalog state. Test seam for `web/src/__tests__`;
 * call alongside `__resetAuthForTests`. Refuses production.
 */
export function __resetCatalogForTests(): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memoryCatalog = new InMemoryCatalogStore();
}

export interface MemberRequest {
  ctx: WorkspaceContext;
  validated: ValidatedRequest;
}

export type MemberDenial =
  | { status: 401; error: string; errorCode: 'INVALID_SESSION' }
  | { status: 403; error: string; errorCode: 'TENANCY_FORBIDDEN' };

/**
 * Authenticate the request and resolve the caller's membership in the
 * TARGET workspace (path param). Any `active` member passes; non-members
 * get a generic 403 (indistinguishable from not-found). Missing/invalid
 * sessions are 401.
 */
export async function requireWorkspaceMember(
  request: Request,
  workspaceId: string
): Promise<
  { ok: true; value: MemberRequest } | { ok: false; denial: MemberDenial }
> {
  const validated = await requireSessionToken(request);
  if (!validated) {
    return {
      ok: false,
      denial: {
        status: 401,
        error: 'Session is expired. Sign in again.',
        errorCode: 'INVALID_SESSION',
      },
    };
  }
  const target = (workspaceId ?? '').trim();
  if (target.length === 0) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
    };
  }
  const member = await getMemberStore().findByWorkspaceAndUser(
    target,
    validated.userId
  );
  if (!member || member.status !== 'active' || member.workspaceId !== target) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
    };
  }
  return { ok: true, value: { ctx: toContext(member), validated } };
}

/**
 * Manager/Admin gate over `requireWorkspaceMember`. Staff get the same
 * generic 403 as non-members (role information never leaks).
 */
export async function requireManagerOrAdmin(
  request: Request,
  workspaceId: string
): Promise<
  { ok: true; value: MemberRequest } | { ok: false; denial: MemberDenial }
> {
  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) return member;
  if (
    member.value.ctx.role !== 'admin' &&
    member.value.ctx.role !== 'manager'
  ) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
    };
  }
  return member;
}

/** Refreshed `Set-Cookie` for cookie-authenticated callers (may be `undefined`). */
export function slideForMember(member: MemberRequest): string | undefined {
  return slideSessionCookie(member.validated);
}

/**
 * Map application-layer catalog errors to HTTP status codes. Messages
 * from the use-cases are client-safe by design (opaque ids only), so
 * they pass through; unknown failures collapse to a generic 500.
 */
export function catalogErrorStatus(err: unknown): {
  status: number;
  errorCode: string;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'CATALOG_VALIDATION':
      return { status: 400, errorCode: 'CATALOG_VALIDATION' };
    case 'TENANCY_FORBIDDEN':
    case 'CATALOG_FORBIDDEN':
      return { status: 403, errorCode: 'TENANCY_FORBIDDEN' };
    case 'CATALOG_NOT_FOUND':
      return { status: 404, errorCode: 'CATALOG_NOT_FOUND' };
    case 'CATALOG_NO_HARD_DELETE':
      return { status: 405, errorCode: 'CATALOG_NO_HARD_DELETE' };
    case 'CATALOG_CONFLICT':
      return { status: 409, errorCode: 'CATALOG_CONFLICT' };
    case 'CATALOG_VERSION_CONFLICT':
      return { status: 409, errorCode: 'CATALOG_VERSION_CONFLICT' };
    case 'CATALOG_SKU_LOCKED':
      return { status: 422, errorCode: 'CATALOG_SKU_LOCKED' };
    case 'CATALOG_WAREHOUSE_INACTIVE':
      return { status: 422, errorCode: 'CATALOG_WAREHOUSE_INACTIVE' };
    case 'CATALOG_INSUFFICIENT_STOCK':
      return { status: 422, errorCode: 'CATALOG_INSUFFICIENT_STOCK' };
    default:
      return { status: 500, errorCode: 'CATALOG_FAILED' };
  }
}

// Record → wire view mapping (Dates become ISO strings at the boundary).

function iso(date: Date): string {
  return date.toISOString();
}

export function toWarehouseView(w: WarehouseRecord): WarehouseView {
  return {
    id: w.id,
    workspaceId: w.workspaceId,
    code: w.code,
    name: w.name,
    status: w.status,
    version: w.version,
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

export function toLevelView(l: InventoryLevelRecord): InventoryLevelView {
  return {
    variantId: l.variantId,
    warehouseId: l.warehouseId,
    qty: l.qty,
    version: l.version,
    updatedAt: iso(l.updatedAt),
  };
}

export function toVariantView(
  v: CatalogVariantRecord,
  levels?: InventoryLevelRecord[]
): VariantView {
  return {
    id: v.id,
    workspaceId: v.workspaceId,
    productId: v.productId,
    skuCode: v.skuCode,
    name: v.name,
    barcode: v.barcode,
    sellingPriceCents: v.sellingPriceCents,
    currency: v.currency,
    hppCents: v.hppCents,
    costSource: v.costSource,
    listingName: v.listingName,
    status: v.status,
    version: v.version,
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
    ...(levels !== undefined ? { levels: levels.map(toLevelView) } : {}),
  };
}

function toPictures(pictures: ProductPicture[]) {
  return pictures.map((p) => ({ fileId: p.fileId, sortOrder: p.sortOrder }));
}

export function toProductView(pw: ProductWithVariants): ProductView {
  return {
    id: pw.product.id,
    workspaceId: pw.product.workspaceId,
    name: pw.product.name,
    description: pw.product.description,
    unit: pw.product.unit,
    pictures: toPictures(pw.product.pictures),
    status: pw.product.status,
    version: pw.product.version,
    createdAt: iso(pw.product.createdAt),
    updatedAt: iso(pw.product.updatedAt),
    variants: pw.variants.map((v) => toVariantView(v)),
  };
}

export function toProductDetailView(detail: ProductDetail): ProductView & {
  variants: Array<VariantView & { mappings: ChannelMappingView[] }>;
} {
  const product: CatalogProductRecord = detail.product;
  return {
    id: product.id,
    workspaceId: product.workspaceId,
    name: product.name,
    description: product.description,
    unit: product.unit,
    pictures: toPictures(product.pictures),
    status: product.status,
    version: product.version,
    createdAt: iso(product.createdAt),
    updatedAt: iso(product.updatedAt),
    variants: detail.variants.map((d: ProductDetailVariant) => ({
      ...toVariantView(d.variant, d.levels),
      mappings: d.mappings.map(toMappingView),
    })),
  };
}

export function toLedgerView(e: StockLedgerRecord): LedgerEntryView {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    variantId: e.variantId,
    warehouseId: e.warehouseId,
    delta: e.delta,
    balanceAfter: e.balanceAfter,
    reason: e.reason,
    actorId: e.actorId,
    correlationId: e.correlationId,
    createdAt: iso(e.createdAt),
  };
}

export function toMappingView(m: ChannelMappingRecord): ChannelMappingView {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    variantId: m.variantId,
    channel: m.channel,
    shopExtId: m.shopExtId,
    platformSkuId: m.platformSkuId,
    sellerSkuHint: m.sellerSkuHint,
    barcodeHint: m.barcodeHint,
    listingName: m.listingName,
    createdAt: iso(m.createdAt),
  };
}
