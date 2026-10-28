import { and, eq, sql } from 'drizzle-orm';
import type {
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

/**
 * Settings writes for the Drizzle inventory sync store (UTA-37 / US04, RFC
 * 06 task 30a). Rows are lazy-created per active mapping; enabling bumps
 * sync_seq. An archived / re-pointed mapping is reset to off (RFC 06 §2).
 */

type SettingsInput = Parameters<InventorySyncWriteStore['upsertSettings']>[0];

/** version + 1 and a fresh updated_at on every state write. */
export const bumpSyncState = () => ({
  version: sql`${s.version} + 1`,
  updatedAt: new Date(),
});

/** Enabled → syncing + sync_seq + 1, else off; refs re-copied from mapping. */
export async function upsertInventorySyncSettings(
  db: DbOrTx,
  input: SettingsInput
) {
  const { workspaceId, mappingId, syncEnabled, stockBuffer, allocationPct } =
    input;
  const [mapping] = await db
    .select({ variantId: m.variantId, connectionId: m.connectionId })
    .from(m)
    .where(inventorySyncScopeWhere({ workspaceId, mappingId }));
  if (!mapping) throw new Error(`Unknown mapping ${mappingId}`);
  const syncStatus = syncEnabled ? ('syncing' as const) : ('off' as const);
  const fields = {
    ...mapping,
    syncEnabled,
    stockBuffer,
    allocationPct,
    syncStatus,
  };
  const [row] = await db
    .insert(s)
    .values({ ...fields, workspaceId, mappingId, syncSeq: syncEnabled ? 1 : 0 })
    .onConflictDoUpdate({
      target: s.mappingId,
      set: {
        ...fields,
        ...bumpSyncState(),
        syncSeq: syncEnabled ? sql`${s.syncSeq} + 1` : sql`${s.syncSeq}`,
      },
      setWhere: eq(s.workspaceId, workspaceId),
    })
    .returning();
  if (!row) throw new Error(`Unknown mapping ${mappingId}`);
  return row as MappingSyncState;
}

/** Archived / re-pointed mapping → off + sync disabled; null if no row. */
export async function resetInventorySyncState(
  db: DbOrTx,
  workspaceId: string,
  mappingId: string
) {
  const [mapping] = await db
    .select({ variantId: m.variantId, connectionId: m.connectionId })
    .from(m)
    .where(and(eq(m.workspaceId, workspaceId), eq(m.id, mappingId)));
  if (!mapping) return null;
  const [row] = await db
    .update(s)
    .set({
      ...mapping,
      syncEnabled: false,
      syncStatus: 'off',
      ...bumpSyncState(),
    })
    .where(and(eq(s.workspaceId, workspaceId), eq(s.mappingId, mappingId)))
    .returning();
  return (row as MappingSyncState | undefined) ?? null;
}
