import { assertTenancyPayloadSafe } from '../tenancy/tenancy-safety';
import {
  inventorySyncFailure,
  type InventorySyncFailureCode,
} from './inventory-sync-errors';
import type { InventorySyncDeps } from './inventory-sync-ports';
import type {
  InventorySyncOutcome,
  InventorySyncTrigger,
  MappingSyncContextSnapshot,
  MappingSyncState,
} from './inventory-sync-types';

/** One push attempt, read fresh by pushMappingInventory. */
export interface SyncAttempt {
  mapping: MappingSyncContextSnapshot;
  attemptSeq: number;
  desiredQty: number;
  trigger: InventorySyncTrigger;
  actorId?: string;
  correlationId?: string;
}

export interface SyncAttemptResult {
  outcome: InventorySyncOutcome;
  /** Committed row; null when a newer syncSeq won (skipped_stale). */
  state: MappingSyncState | null;
  desiredQty: number;
  pushedQty: number | null;
  errorCode: InventorySyncFailureCode | null;
}

/**
 * Records one push attempt (UTA-37 / US04, RFC 06 task 24a). CAS commit on
 * attemptSeq: pushedQty → synced, errorCode → needs_attention with a calm
 * reason, lost CAS → skipped_stale (row stays syncing; the caller runs the
 * catch-up). Always appends the sync event; audits only committed rows.
 */
export async function recordSyncAttempt(
  deps: InventorySyncDeps,
  attempt: SyncAttempt,
  result: { pushedQty: number } | { errorCode: InventorySyncFailureCode }
): Promise<SyncAttemptResult> {
  const { mapping, attemptSeq, desiredQty, trigger, actorId } = attempt;
  const { workspaceId } = mapping;
  const correlationId = attempt.correlationId ?? null;
  const failure =
    'errorCode' in result ? inventorySyncFailure(result.errorCode) : null;
  const errorMessage = failure?.reason ?? null;
  const shared = {
    desiredQty,
    pushedQty: 'pushedQty' in result ? result.pushedQty : null,
    errorCode: failure?.errorCode ?? null,
  };
  const ids = {
    mappingId: mapping.mappingId,
    variantId: mapping.variantId,
    connectionId: mapping.connectionId,
    channel: mapping.channel,
  };
  const committed = failure ? 'needs_attention' : 'synced';

  const state = await deps.writes.commitAttempt({
    workspaceId,
    mappingId: ids.mappingId,
    attemptSeq,
    outcome: committed,
    ...shared,
    errorMessage,
    at: deps.now(),
  });
  const outcome: InventorySyncOutcome = state ? committed : 'skipped_stale';
  await deps.writes.appendEvent({
    workspaceId,
    ...ids,
    shopExtId: mapping.shopExtId,
    platformSkuId: mapping.platformSkuId,
    syncSeq: attemptSeq,
    trigger,
    outcome,
    ...shared,
    errorMessage,
    actorId: actorId ?? null,
    correlationId,
  });
  if (!state) return { outcome, state, ...shared };

  const payload = { ...ids, ...shared, syncSeq: attemptSeq, trigger };
  assertTenancyPayloadSafe(payload, 'inventory_sync');
  await deps.audit.append({
    workspaceId,
    category: 'workspace',
    actorType: actorId ? 'user' : 'system',
    actorId,
    correlationId: correlationId ?? undefined,
    action: failure
      ? 'inventory_sync.needs_attention'
      : 'inventory_sync.pushed',
    payload,
  });
  return { outcome, state, ...shared };
}
