import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  InventorySyncScope,
  InventorySyncWriteStore,
  MappingSyncState,
} from '@tokoboss/application';
import {
  catalogChannelMappings as m,
  marketplaceInventorySyncStates as s,
} from '../schema/index';
import {
  type DbOrTx,
  inventorySyncScopeWhere,
} from './drizzle-inventory-sync-scope';
import { bumpSyncState } from './drizzle-inventory-sync-settings';

/**
 * Push-attempt writes for the Drizzle inventory sync store (UTA-37 / US04,
 * RFC 06 task 30b): fan-out markSyncing (sync_seq + 1) and the CAS commit
 * (WHERE mapping_id = :id AND sync_seq = :seq; stale attempt → null).
 */

type CommitInput = Parameters<InventorySyncWriteStore['commitAttempt']>[0];

/** Enabled, still-matching (not re-pointed) active mappings in scope. */
export async function markInventorySyncing(
  db: DbOrTx,
  scope: InventorySyncScope
) {
  if (scope.variantIds?.length === 0) return [];
  const live = db
    .select({ id: m.id })
    .from(m)
    .where(and(inventorySyncScopeWhere(scope), eq(m.variantId, s.variantId)));
  const rows = await db
    .update(s)
    .set({
      syncStatus: 'syncing',
      syncSeq: sql`${s.syncSeq} + 1`,
      ...bumpSyncState(),
    })
    .where(
      and(
        eq(s.workspaceId, scope.workspaceId),
        eq(s.syncEnabled, true),
        inArray(s.mappingId, live)
      )
    )
    .returning();
  return rows as MappingSyncState[];
}

/** synced keeps the pushed seq/time; needs_attention keeps the last good. */
export async function commitInventorySyncAttempt(
  db: DbOrTx,
  input: CommitInput
) {
  const { workspaceId, mappingId, attemptSeq } = input;
  const synced = input.outcome === 'synced';
  const [row] = await db
    .update(s)
    .set({
      syncStatus: input.outcome,
      desiredQty: input.desiredQty,
      lastPushedQty: input.pushedQty ?? sql`${s.lastPushedQty}`,
      lastSyncedAt: synced ? input.at : sql`${s.lastSyncedAt}`,
      lastPushedSeq: synced ? attemptSeq : sql`${s.lastPushedSeq}`,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
      ...bumpSyncState(),
    })
    .where(
      and(
        eq(s.workspaceId, workspaceId),
        eq(s.mappingId, mappingId),
        eq(s.syncSeq, attemptSeq)
      )
    )
    .returning();
  return (row as MappingSyncState | undefined) ?? null;
}
