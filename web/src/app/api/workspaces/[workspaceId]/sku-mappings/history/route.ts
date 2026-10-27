/**
 * Riwayat pemetaan Store SKU (UTA-40 / US03, RFC 05 row 29; AC5).
 * GET /api/workspaces/:workspaceId/sku-mappings/history[?variantId&limit]
 *
 * Any active member, Staff included (RFC 02 neutral 404 otherwise). Newest
 * first; limit 1..100 (default 50). An unknown or malformed variantId gives
 * an empty list, not 404. Actors are shown by display name only (fallback
 * "Anggota tim"), never by email. Returns { events }.
 */
import { listSkuMappingHistory } from '@tokoboss/application';
import { SkuMappingHistoryQuerySchema } from '@tokoboss/contracts';
import { storageKind } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getSkuMappingDeps } from '@/lib/sku-mappings';
import {
  admitSkuMappingMember,
  skuMappingDenied,
  skuMappingFailed,
  skuMappingInvalid,
  type RouteIds,
} from '@/lib/sku-mapping-routes';
import { toSkuMappingHistoryEventView } from '@/lib/sku-mapping-views';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

const QUERY_KEYS = ['variantId', 'limit'] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const parsed = SkuMappingHistoryQuerySchema.safeParse(raw);
  if (!parsed.success) return skuMappingInvalid(ids);
  const { variantId, limit } = parsed.data;
  // Postgres variant ids are uuids; a malformed one would be a driver 500.
  // It can match nothing, so answer like an unknown variantId (empty list).
  const v = variantId?.trim();
  if (v && storageKind() === 'postgres' && !UUID_RE.test(v)) {
    return authJson({ events: [] }, 200, ...ids, admitted.cookie);
  }
  try {
    const { reads } = getSkuMappingDeps();
    const entries = await listSkuMappingHistory({ reads }, admitted.ctx, {
      workspaceId,
      variantId,
      limit,
    });
    const body = { events: entries.map(toSkuMappingHistoryEventView) };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return skuMappingFailed(err, ids, 'SKU mapping history failed.');
  }
}
