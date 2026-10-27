/**
 * Petakan Store SKU overview / single map (UTA-40 / US03, RFC 05 row 26).
 * GET  /api/workspaces/:workspaceId/sku-mappings[?q&filter&connectionId&variantId]
 * POST /api/workspaces/:workspaceId/sku-mappings (map / remap one Store SKU)
 *
 * GET: any active member (RFC 02 neutral 404). POST: Admin/Manager (Staff
 * 403 before the body is read). 201 on mapped/restored, 200 on remap or
 * idempotent re-map; the body carries the enriched SubordinateStoreSkuView.
 */
import { getSkuMappingOverview, mapStoreSku } from '@tokoboss/application';
import {
  MapStoreSkuBodySchema,
  SkuMappingOverviewQuerySchema,
} from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getSkuMappingDeps } from '@/lib/sku-mappings';
import {
  admitSkuMappingMember,
  requireSkuMappingEditor,
  skuMappingDenied,
  skuMappingFailed,
  skuMappingInvalid,
  type RouteIds,
} from '@/lib/sku-mapping-routes';
import {
  toSkuMappingOverviewResponse,
  toSubordinateStoreSkuView,
} from '@/lib/sku-mapping-views';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

const QUERY_KEYS = ['q', 'filter', 'connectionId', 'variantId'] as const;

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await admitSkuMappingMember(request, workspaceId);
  if (!admitted.ok) return skuMappingDenied(admitted.denial, ids);
  const search = new URL(request.url).searchParams;
  const raw = Object.fromEntries(
    QUERY_KEYS.flatMap((k) => (search.has(k) ? [[k, search.get(k)]] : []))
  );
  const parsed = SkuMappingOverviewQuerySchema.safeParse(raw);
  if (!parsed.success) return skuMappingInvalid(ids);
  try {
    const { reads } = getSkuMappingDeps();
    const overview = await getSkuMappingOverview({ reads }, admitted.ctx, {
      workspaceId,
      ...parsed.data,
    });
    const body = toSkuMappingOverviewResponse(overview);
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return skuMappingFailed(err, ids, 'SKU mapping overview failed.');
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await requireSkuMappingEditor(request, workspaceId);
  if (!admitted.ok) return skuMappingDenied(admitted.denial, ids);
  const parsed = MapStoreSkuBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return skuMappingInvalid(ids);
  try {
    const deps = getSkuMappingDeps();
    const result = await mapStoreSku(deps, admitted.ctx, {
      workspaceId,
      ...parsed.data,
      correlationId,
    });
    const { variantId } = result.mapping;
    const overview = await getSkuMappingOverview(deps, admitted.ctx, {
      workspaceId,
      variantId,
    });
    const enriched = overview.items
      .flatMap((c) => c.mappings)
      .find((m) => m.id === result.mapping.id);
    log.info('sku mapping saved', {
      route: '/api/workspaces/[workspaceId]/sku-mappings',
      mappingId: result.mapping.id,
      outcome: result.outcome,
    });
    const body = {
      mapping: enriched ? toSubordinateStoreSkuView(enriched) : null,
      outcome: result.outcome,
    };
    return authJson(body, result.created ? 201 : 200, ...ids, admitted.cookie);
  } catch (err) {
    return skuMappingFailed(err, ids, 'SKU mapping failed.');
  }
}
