import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import type {
  InventorySyncDeps,
  InventorySyncScope,
} from './inventory-sync-ports';
import type {
  InventorySyncAttentionBannerItem,
  MappingSyncState,
} from './inventory-sync-types';
import {
  pushMappingInventory,
  type PushMappingInventoryInput,
} from './push-mapping-inventory';
import type { SyncAttemptResult } from './record-sync-attempt';

/** First push + 1 catch-up when a newer syncSeq won mid-flight. */
const MAX_PASSES = 2;

export type SyncVariantInventoryInput = InventorySyncScope &
  Omit<PushMappingInventoryInput, 'workspaceId' | 'mappingId'>;

export interface MappingSyncRunResult extends SyncAttemptResult {
  mappingId: string;
}

export interface InventorySyncOverview {
  /** Existing state rows; mappings without one are 'off' by default. */
  states: MappingSyncState[];
  /** needs_attention alerts, newest first. */
  attention: InventorySyncAttentionBannerItem[];
}

/**
 * Pushes every active sync_enabled mapping in scope (UTA-37 / US04, RFC 06
 * task 25): variantIds / connectionId / mappingId within one workspace.
 * Sequential (gentle on provider rate limits); one mapping's failure never
 * blocks the others (24b records needs_attention instead of throwing).
 * skipped_stale → one immediate catch-up push for the latest syncSeq.
 */
export async function syncVariantInventory(
  deps: InventorySyncDeps,
  input: SyncVariantInventoryInput
): Promise<MappingSyncRunResult[]> {
  const { trigger, actorId, correlationId, ...scope } = input;
  const base = {
    workspaceId: scope.workspaceId,
    trigger,
    actorId,
    correlationId,
  };
  const mappingIds = await deps.reads.listSyncEnabledMappingIds(scope);
  const results: MappingSyncRunResult[] = [];
  for (const mappingId of mappingIds) {
    let result: SyncAttemptResult | null = null;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      result = await pushMappingInventory(deps, { ...base, mappingId });
      if (result?.outcome !== 'skipped_stale') break;
    }
    if (result) results.push({ mappingId, ...result });
  }
  return results;
}

/**
 * Sync states + needs_attention alerts for the workspace, a variant set or a
 * store (RFC 06 task 25). Read-only: admin, manager and staff may read;
 * non-members fail assertSameWorkspace (404 at the route).
 */
export async function listInventorySyncOverview(
  deps: Pick<InventorySyncDeps, 'reads'>,
  ctx: WorkspaceContext | null,
  query: InventorySyncScope
): Promise<InventorySyncOverview> {
  assertSameWorkspace(ctx, query.workspaceId);
  const [states, attention] = await Promise.all([
    deps.reads.listStates(query),
    deps.reads.listAttention(query),
  ]);
  return { states, attention };
}
