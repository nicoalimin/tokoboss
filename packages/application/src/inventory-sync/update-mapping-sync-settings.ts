import { assertTenancyPayloadSafe } from '../tenancy/tenancy-safety';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import {
  inventorySyncMappingNotFound,
  inventorySyncRoleForbidden,
} from './inventory-sync-errors';
import type { InventorySyncDeps } from './inventory-sync-ports';
import type { MappingSyncState } from './inventory-sync-types';

/** Omitted fields keep the stored value (or the column default). */
export interface UpdateMappingSyncSettingsInput {
  workspaceId: string;
  mappingId: string;
  syncEnabled?: boolean;
  stockBuffer?: number;
  allocationPct?: number;
  correlationId?: string;
}

export interface UpdateMappingSyncSettingsResult {
  state: MappingSyncState;
  /** True when syncEnabled, stockBuffer or allocationPct changed. */
  changed: boolean;
}

const DEFAULTS = { syncEnabled: false, stockBuffer: 0, allocationPct: 100 };

/**
 * Atur sinkronisasi stok per Store SKU (UTA-37 / US04, RFC 06 task 23).
 * Admin/Manager only (Staff → 403); unknown, archived or cross-workspace
 * mapping → 404. Upsert lazily creates the state row: enabled → syncing +
 * syncSeq + 1 (the caller pushes), disabled → off. Audit only on change.
 */
export async function updateMappingSyncSettings(
  deps: InventorySyncDeps,
  ctx: WorkspaceContext | null,
  input: UpdateMappingSyncSettingsInput
): Promise<UpdateMappingSyncSettingsResult> {
  assertSameWorkspace(ctx, input.workspaceId);
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    throw inventorySyncRoleForbidden();
  }
  const { workspaceId, mappingId, correlationId } = input;
  const mapping = await deps.reads.loadMappingContext(workspaceId, mappingId);
  if (!mapping || mapping.workspaceId !== workspaceId) {
    throw inventorySyncMappingNotFound();
  }

  const before = mapping.state ?? DEFAULTS;
  const next = {
    syncEnabled: input.syncEnabled ?? before.syncEnabled,
    stockBuffer: input.stockBuffer ?? before.stockBuffer,
    allocationPct: input.allocationPct ?? before.allocationPct,
  };
  const changed =
    next.syncEnabled !== before.syncEnabled ||
    next.stockBuffer !== before.stockBuffer ||
    next.allocationPct !== before.allocationPct;

  const state = await deps.writes.upsertSettings({
    workspaceId,
    mappingId,
    ...next,
  });
  if (!changed) return { state, changed };

  const payload = {
    mappingId,
    variantId: mapping.variantId,
    connectionId: mapping.connectionId,
    channel: mapping.channel,
    previous: {
      syncEnabled: before.syncEnabled,
      stockBuffer: before.stockBuffer,
      allocationPct: before.allocationPct,
    },
    ...next,
    syncSeq: state.syncSeq,
  };
  assertTenancyPayloadSafe(payload, 'inventory_sync');
  await deps.audit.append({
    workspaceId,
    category: 'workspace',
    actorId: ctx.userId,
    correlationId,
    action: 'inventory_sync.settings_updated',
    payload,
  });
  return { state, changed };
}
