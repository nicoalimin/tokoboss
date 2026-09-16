import { archiveVariant, getVariant } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toMappingView,
  toVariantView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * Archive a variant (idempotent soft-delete, UTA-75 Story 01).
 * POST /api/workspaces/:workspaceId/catalog/variants/:variantId/archive
 * (Manager/Admin). Stock history is untouched.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, variantId } = await params;

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
    const archived = await archiveVariant(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId,
    });
    log.info('catalog variant archived', {
      route:
        '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/archive',
      variantId: archived.id,
    });
    const detail = await getVariant(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId: archived.id,
    });
    return authJson(
      {
        variant: {
          ...toVariantView(detail.variant, detail.levels),
          mappings: detail.mappings.map(toMappingView),
        },
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
      log.warn('catalog variant archive failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/archive',
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
