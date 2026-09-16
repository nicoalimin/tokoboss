import {
  catalogNoHardDelete,
  getProductDetail,
  updateProduct,
} from '@tokoboss/application';
import { UpdateProductBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toProductDetailView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; productId: string }>;
}

/**
 * Product detail with variants + levels + mappings (UTA-75, Story 01).
 * GET /api/workspaces/:workspaceId/catalog/products/:productId
 * (any active member; workspace-scoped).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, productId } = await params;

  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
      requestId,
      correlationId
    );
  }

  try {
    const detail = await getProductDetail(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      productId,
    });
    return authJson(
      { product: toProductDetailView(detail), storage: storageKind() },
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
 * Update permitted product fields (UTA-75, Story 01).
 * PATCH /api/workspaces/:workspaceId/catalog/products/:productId
 * (Manager/Admin). Status changes go through the archive endpoint;
 * stale `expectedVersion` values reject with 409 (no silent overwrite).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = UpdateProductBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const updated = await updateProduct(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      productId,
      name: parsed.data.name,
      description: parsed.data.description,
      unit: parsed.data.unit,
      pictures: parsed.data.pictures,
      expectedVersion: parsed.data.expectedVersion,
    });
    return authJson(
      {
        product: toProductDetailView(
          await getProductDetail(getCatalogStore(), {
            ctx: manager.value.ctx,
            workspaceId: manager.value.ctx.workspaceId,
            productId: updated.id,
          })
        ),
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog product update failed', {
        route: '/api/workspaces/[workspaceId]/catalog/products/[productId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Catalog update failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog update failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * Catalog rows are never hard-deleted — archive instead (UTA-75).
 * DELETE always answers 405 `CATALOG_NO_HARD_DELETE`.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
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
  const err = catalogNoHardDelete();
  const mapped = catalogErrorStatus(err);
  return authJson(
    {
      error: err.message,
      errorCode: mapped.errorCode,
    },
    mapped.status,
    requestId,
    correlationId,
    slideForMember(member.value)
  );
}
