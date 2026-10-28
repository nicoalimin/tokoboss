/**
 * Atur sinkronisasi stok per Store SKU (UTA-37 / US04, RFC 06 task 37b).
 * PATCH …/sku-mappings/:mappingId/sync: settings; push when on + changed
 * (or `syncNow`). POST: Sinkronkan sekarang / Coba lagi for one mapping.
 * Non-member 404, Staff 403 ROLE_FORBIDDEN, unknown mapping 404; push is
 * best-effort → 200 { state, synced }.
 */
import { UpdateMappingSyncSettingsInputSchema } from '@tokoboss/contracts';
import {
  inventorySyncMappingNotFound,
  updateMappingSyncSettings,
  type WorkspaceContext,
} from '@tokoboss/application';
import { storageKind } from '@/lib/auth';
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

interface RouteParams {
  params: Promise<{ workspaceId: string; mappingId: string }>;
}
type Run = (ctx: WorkspaceContext, id: string, cid: string) => Promise<boolean>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: Request, { params }: RouteParams, run: Run) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: [string, string] = [requestId, correlationId];
  const { workspaceId, mappingId } = await params;
  const admitted = await requireInventorySyncEditor(request, workspaceId);
  if (!admitted.ok) return inventorySyncDenied(admitted.denial, ids);
  try {
    // Postgres ids are uuids (malformed → 404); memory mode uses `map-N`.
    const { reads } = getInventorySyncDeps();
    const load = () => reads.loadMappingContext(workspaceId, mappingId);
    const bad = storageKind() === 'postgres' && !UUID_RE.test(mappingId);
    if (bad || !(await load())) throw inventorySyncMappingNotFound();
    const synced = await run(admitted.ctx, mappingId, correlationId);
    const state = (await load())?.state;
    const body = {
      state: state ? toMappingSyncStateView(state) : null,
      synced,
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return inventorySyncFailed(err, ids, log);
  }
}

const push =
  (trigger: 'config_change' | 'manual_retry') =>
  (ctx: WorkspaceContext, mappingId: string, correlationId: string) =>
    triggerVariantInventorySync({
      workspaceId: ctx.workspaceId,
      mappingId,
      trigger,
      actorId: ctx.userId,
      correlationId,
    });

export async function PATCH(request: Request, route: RouteParams) {
  return handle(request, route, async (ctx, mappingId, correlationId) => {
    const raw: unknown = await request.json().catch(() => null);
    const parsed = UpdateMappingSyncSettingsInputSchema.safeParse(raw);
    if (!parsed.success) {
      const err = new Error('Pengaturan sinkronisasi tidak valid.');
      throw Object.assign(err, { code: 'INVENTORY_SYNC_VALIDATION' });
    }
    const { syncNow, ...settings } = parsed.data;
    const { workspaceId } = ctx;
    const input = { workspaceId, mappingId, correlationId, ...settings };
    const deps = getInventorySyncDeps();
    const res = await updateMappingSyncSettings(deps, ctx, input);
    if (!res.state.syncEnabled || !(res.changed || syncNow)) return false;
    return push('config_change')(ctx, mappingId, correlationId);
  });
}

export async function POST(request: Request, route: RouteParams) {
  return handle(request, route, push('manual_retry'));
}
