import { archiveProduct, getProductDetail } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toProductDetailView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; productId: string }>;
}

/**
 * Archive a product (idempotent soft-delete, UTA-75 Story 01).
 * POST /api/workspaces/:workspaceId/catalog/products/:productId/archive
 * (Manager/Admin).
 *
 * Archiving is the ONLY removal path when stock or orders exist — active
 * variants archive alongside the product, stock history is untouched.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, productId } = await params;

  const manager = await requireManagerOrAdmin(request, workspaceId);
  if (!manager.ok) {
    return authJson(
      { error: manager.denial.error, errorCode: manager.denial.errorCode },
      manager.denial.status,
      requestId,
      correlationId
    );
  }

  try {
    const archived = await archiveProduct(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      productId,
    });
    log.info('catalog product archived', {
      route:
        '/api/workspaces/[workspaceId]/catalog/products/[productId]/archive',
      productId: archived.id,
    });
    const detail = await getProductDetail(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      productId: archived.id,
    });
    return authJson(
      { product: toProductDetailView(detail), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog product archive failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/products/[productId]/archive',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Catalog archive failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog archive failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
