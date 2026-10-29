import {
  inventorySyncFailure,
  type InventorySyncAttentionBannerItem,
  type InventorySyncFailureCode,
  type InventorySyncReadStore,
  type InventorySyncScope,
  type MappingSyncState,
} from '@tokoboss/application';
import { loadInventorySyncContext } from './drizzle-inventory-sync-context';
import {
  type DbOrTx,
  selectScopedMappings,
  toInventorySyncMappingRef,
} from './drizzle-inventory-sync-scope';

/**
 * Postgres-backed InventorySyncReadStore (UTA-37 / US04, RFC 06 task 29c).
 * Scope + joins live in 29a, the per-push context in 29b; this class adds
 * the fan-out ids, state list and the Perlu tindakan banner (newest first,
 * calm Indonesian reason + remediation). Writes are row 30, facade row 31.
 */
export class DrizzleInventorySyncReads implements InventorySyncReadStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleInventorySyncReads {
    return new DrizzleInventorySyncReads(tx);
  }

  loadMappingContext(workspaceId: string, mappingId: string) {
    return loadInventorySyncContext(this.db, workspaceId, mappingId);
  }

  async listSyncEnabledMappingIds(scope: InventorySyncScope) {
    const rows = await selectScopedMappings(this.db, scope);
    // Skip stores with store-level stock sync paused (RFC 07 row 18).
    const on = (r: (typeof rows)[number]) =>
      r.state?.syncEnabled && r.connection?.inventorySyncEnabled !== false;
    return rows.filter(on).map((r) => r.mapping.id);
  }

  async listStates(scope: InventorySyncScope): Promise<MappingSyncState[]> {
    const rows = await selectScopedMappings(this.db, scope);
    return rows.flatMap((r) => (r.state ? [r.state as MappingSyncState] : []));
  }

  async listAttention(scope: InventorySyncScope) {
    const items: InventorySyncAttentionBannerItem[] = [];
    for (const row of await selectScopedMappings(this.db, scope)) {
      const s = row.state;
      if (s?.syncStatus !== 'needs_attention' || !s.lastErrorCode) continue;
      const { reason, remediation } = inventorySyncFailure(
        s.lastErrorCode as InventorySyncFailureCode
      );
      items.push({
        ...toInventorySyncMappingRef(row),
        errorCode: s.lastErrorCode,
        reason: s.lastErrorMessage ?? reason,
        remediation,
        updatedAt: s.updatedAt,
      });
    }
    return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
