/**
 * Petakan otomatis saran cocok (UTA-40 / US03, RFC 05 row 27).
 * POST /api/workspaces/:workspaceId/sku-mappings/bulk
 *
 * Admin/Manager only (Staff 403 before the body is read). Maps 1..200
 * single-match 'suggested' listings atomically; any ambiguous, mapped or
 * mismatched item rejects the whole batch with 422
 * SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW (details.platformSkuIds). Returns
 * { mappedCount, mappings } with the enriched SubordinateStoreSkuViews.
 */
import { bulkMapStoreSkus, getSkuMappingOverview } from '@tokoboss/application';
import { BulkMapStoreSkusBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getSkuMappingDeps } from '@/lib/sku-mappings';
import {
  requireSkuMappingEditor,
  skuMappingDenied,
  skuMappingFailed,
  skuMappingInvalid,
  type RouteIds,
} from '@/lib/sku-mapping-routes';
import { toSubordinateStoreSkuView } from '@/lib/sku-mapping-views';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await requireSkuMappingEditor(request, workspaceId);
  if (!admitted.ok) return skuMappingDenied(admitted.denial, ids);
  const parsed = BulkMapStoreSkusBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return skuMappingInvalid(ids);
  try {
    const deps = getSkuMappingDeps();
    const result = await bulkMapStoreSkus(deps, admitted.ctx, {
      workspaceId,
      items: parsed.data.items,
      correlationId,
    });
    const mapped = new Set(result.mappings.map((m) => m.id));
    const overview = await getSkuMappingOverview(deps, admitted.ctx, {
      workspaceId,
    });
    const mappings = overview.items
      .flatMap((c) => c.mappings)
      .filter((m) => mapped.has(m.id))
      .map(toSubordinateStoreSkuView);
    log.info('sku mappings bulk mapped', {
      route: '/api/workspaces/[workspaceId]/sku-mappings/bulk',
      mappedCount: result.mappedCount,
    });
    const body = { mappedCount: result.mappedCount, mappings };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return skuMappingFailed(err, ids, 'SKU bulk mapping failed.');
  }
}
