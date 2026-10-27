/**
 * Lepas pemetaan Store SKU (UTA-40 / US03, RFC 05 row 28).
 * DELETE /api/workspaces/:workspaceId/sku-mappings/:mappingId
 *
 * Admin/Manager only (Staff 403 TENANCY_FORBIDDEN). Archives the live
 * mapping, recomputes the staged listing's mapping state and appends an
 * 'unmapped' history row (use case). Unknown, archived, cross-workspace or
 * malformed ids → 404 SKU_MAPPING_NOT_FOUND. Returns 200
 * { deleted: true, recomputedMappingState }.
 */
import { skuMappingNotFound, unmapStoreSku } from '@tokoboss/application';
import { storageKind } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getSkuMappingDeps } from '@/lib/sku-mappings';
import {
  requireSkuMappingEditor,
  skuMappingDenied,
  skuMappingFailed,
  type RouteIds,
} from '@/lib/sku-mapping-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; mappingId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, mappingId } = await params;
  const admitted = await requireSkuMappingEditor(request, workspaceId);
  if (!admitted.ok) return skuMappingDenied(admitted.denial, ids);
  try {
    // Postgres ids are uuids; a malformed id would be a driver 500 → 404.
    // Memory mode (fixtures, web tests) uses `map-N` ids, so no check.
    if (storageKind() === 'postgres' && !UUID_RE.test(mappingId)) {
      throw skuMappingNotFound();
    }
    const result = await unmapStoreSku(getSkuMappingDeps(), admitted.ctx, {
      workspaceId,
      mappingId,
      correlationId,
    });
    log.info('sku mapping unmapped', {
      route: '/api/workspaces/[workspaceId]/sku-mappings/[mappingId]',
      mappingId,
      recomputedMappingState: result.recomputedMappingState,
    });
    const body = {
      deleted: result.deleted,
      recomputedMappingState: result.recomputedMappingState,
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return skuMappingFailed(err, ids, 'SKU unmapping failed.');
  }
}
