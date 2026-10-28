/**
 * Sinkronisasi stok overview + bulk sync (UTA-37 / US04, RFC 06 task 38b).
 * GET  …/inventory-sync[?variantIds=a,b&connectionId]: per-mapping sync
 * states + needs_attention alerts (Admin, Manager, Staff).
 * POST …/inventory-sync { mappingId | variantId | connectionId }: bulk
 * Sinkronkan sekarang / Coba lagi (Admin/Manager; Staff 403 ROLE_FORBIDDEN).
 * Non-member 404; bad query / body 400; push is best-effort → 200.
 */
import { listInventorySyncOverview } from '@tokoboss/application';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  getInventorySyncDeps,
  triggerVariantInventorySync,
} from '@/lib/inventory-sync';
import {
  inventorySyncDenied,
  inventorySyncFailed,
  requireInventorySyncEditor,
  toMappingSyncStateView,
} from '@/lib/inventory-sync-routes';
import {
  inventorySyncInvalid,
  parseInventorySyncQuery,
  parseInventorySyncTrigger,
  toAttentionItemView,
} from '@/lib/inventory-sync-scope';
import { admitSkuMappingMember, type RouteIds } from '@/lib/sku-mapping-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await admitSkuMappingMember(request, workspaceId);
  if (!admitted.ok) return inventorySyncDenied(admitted.denial, ids);
  const filter = parseInventorySyncQuery(request.url);
  if (!filter) return inventorySyncInvalid(ids);
  try {
    const deps = getInventorySyncDeps();
    const query = { workspaceId, ...filter };
    const overview = await listInventorySyncOverview(deps, admitted.ctx, query);
    const body = {
      states: overview.states.map(toMappingSyncStateView),
      attention: overview.attention.map(toAttentionItemView),
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return inventorySyncFailed(err, ids, log);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await requireInventorySyncEditor(request, workspaceId);
  if (!admitted.ok) return inventorySyncDenied(admitted.denial, ids);
  const raw: unknown = await request.json().catch(() => null);
  const scope = parseInventorySyncTrigger(raw);
  if (!scope) return inventorySyncInvalid(ids);
  const input = {
    workspaceId,
    ...scope,
    trigger: 'manual_retry' as const,
    actorId: admitted.ctx.userId,
    correlationId,
  };
  const synced = await triggerVariantInventorySync(input, log);
  return authJson({ synced }, 200, ...ids, admitted.cookie);
}
