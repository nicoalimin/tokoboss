import { deleteMapping } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{
    workspaceId: string;
    variantId: string;
    mappingId: string;
  }>;
}

/**
 * Delete a Store SKU mapping (UTA-75, Story 01 — stub data only).
 * DELETE /api/workspaces/:workspaceId/catalog/variants/:variantId/mappings/:mappingId
 * (Manager/Admin). Removing a mapping un-locks SKU code edits; ledger
 * history is untouched. Answers 204 with request/correlation headers.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, mappingId } = await params;

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
    await deleteMapping(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      mappingId,
    });
    log.info('catalog mapping deleted', {
      route:
        '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/mappings/[mappingId]',
      mappingId,
    });
    return authJson(
      { deleted: true },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog mapping delete failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/mappings/[mappingId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Mapping delete failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Mapping delete failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
