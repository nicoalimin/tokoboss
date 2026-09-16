import { createProduct, listProducts } from '@tokoboss/application';
import { CreateProductBodySchema } from '@tokoboss/contracts';
import { getCatalogStore, storageKind } from '@/lib/catalog';
import {
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  toProductView,
  catalogErrorStatus,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List products with variants (UTA-75, Story 01).
 * GET /api/workspaces/:workspaceId/catalog/products?q=&status=&limit=
 * (any active member; workspace-scoped).
 *
 * `q` searches one query across product name, SKU TokoBoss, barcode,
 * Store SKU hint, and listing name (shared with UTA-28 scope).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId } = await params;

  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
      requestId,
      correlationId
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const statusParam = url.searchParams.get('status');
  const limitParam = url.searchParams.get('limit');
  const status =
    statusParam === 'active' || statusParam === 'archived'
      ? statusParam
      : undefined;
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const products = await listProducts(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      q,
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return authJson(
      { products: products.map(toProductView), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog read failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * Create a product with ≥1 variants (UTA-75, Story 01).
 * POST /api/workspaces/:workspaceId/catalog/products (Manager/Admin).
 *
 * Duplicate SKU TokoBoss codes reject with 409 `CATALOG_CONFLICT` and a
 * path to the existing row; nothing is persisted on conflict.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId } = await params;

  const manager = await requireManagerOrAdmin(request, workspaceId);
  if (!manager.ok) {
    return authJson(
      { error: manager.denial.error, errorCode: manager.denial.errorCode },
      manager.denial.status,
      requestId,
      correlationId
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = CreateProductBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const created = await createProduct(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description,
      unit: parsed.data.unit,
      pictures: parsed.data.pictures,
      variants: parsed.data.variants,
    });
    log.info('catalog product created', {
      route: '/api/workspaces/[workspaceId]/catalog/products',
      productId: created.product.id,
    });
    return authJson(
      {
        product: toProductView(created),
        storage: storageKind(),
      },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog product create failed', {
        route: '/api/workspaces/[workspaceId]/catalog/products',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Catalog create failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    const details =
      typeof err === 'object' && err !== null && 'details' in err
        ? (err as { details?: Record<string, unknown> }).details
        : undefined;
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog create failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
