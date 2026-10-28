import { InMemoryInventorySyncReadStore } from './in-memory-inventory-sync-reads';
import {
  blankSyncState,
  providerStockKey,
} from './in-memory-inventory-sync-state';
import type {
  InventorySyncScope,
  InventorySyncWriteStore,
} from './inventory-sync-ports';
import type { MappingSyncState } from './inventory-sync-types';

type WriteInput<K extends keyof InventorySyncWriteStore> = Parameters<
  InventorySyncWriteStore[K]
>[0];

/**
 * In-memory inventory sync store (UTA-37 / US04, RFC 06 task 26c): the 26b
 * read fake plus InventorySyncWriteStore over the same seedable state (26a),
 * with the syncSeq CAS (stale attempt → null) and the append-only event log.
 * Mutates state in place; returns copies.
 */
export class InMemoryInventorySyncStore
  extends InMemoryInventorySyncReadStore
  implements InventorySyncWriteStore
{
  /** Bumps version + updatedAt and stores the row; returns a copy. */
  private save(row: MappingSyncState): MappingSyncState {
    const updatedAt = this.state.now();
    const next = { ...row, version: row.version + 1, updatedAt };
    this.state.states.set(row.mappingId, next);
    return { ...next };
  }

  /** Lazy-creates the row; enabled → syncing + syncSeq + 1, else off. */
  async upsertSettings(input: WriteInput<'upsertSettings'>) {
    const { workspaceId, mappingId, syncEnabled } = input;
    const [mapping] = this.mappingsIn({ workspaceId, mappingId });
    if (!mapping) throw new Error(`Unknown mapping ${mappingId}`);
    const prev =
      this.state.states.get(mappingId) ??
      blankSyncState(mapping, this.state.now());
    return this.save({
      ...prev,
      syncEnabled,
      stockBuffer: input.stockBuffer,
      allocationPct: input.allocationPct,
      syncStatus: syncEnabled ? 'syncing' : 'off',
      syncSeq: syncEnabled ? prev.syncSeq + 1 : prev.syncSeq,
    });
  }

  async markSyncing(scope: InventorySyncScope) {
    return this.mappingsIn(scope).flatMap((m) => {
      const s = this.state.states.get(m.mappingId);
      if (!s?.syncEnabled) return [];
      const syncSeq = s.syncSeq + 1;
      return [this.save({ ...s, syncStatus: 'syncing', syncSeq })];
    });
  }

  /** CAS on syncSeq: a newer seq (or another workspace) → null. */
  async commitAttempt(input: WriteInput<'commitAttempt'>) {
    const s = this.state.states.get(input.mappingId);
    if (!s || s.workspaceId !== input.workspaceId) return null;
    if (s.syncSeq !== input.attemptSeq) return null;
    const synced = input.outcome === 'synced';
    return this.save({
      ...s,
      syncStatus: input.outcome,
      desiredQty: input.desiredQty,
      lastPushedQty: input.pushedQty ?? s.lastPushedQty,
      lastSyncedAt: synced ? input.at : s.lastSyncedAt,
      lastPushedSeq: synced ? input.attemptSeq : s.lastPushedSeq,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
    });
  }

  async appendEvent(input: WriteInput<'appendEvent'>) {
    const { events, now } = this.state;
    const id = `sync-evt-${events.length + 1}`;
    const event = { ...input, id, createdAt: now() };
    events.push(event);
    return { ...event };
  }

  async setListingProviderStock(input: WriteInput<'setListingProviderStock'>) {
    const { workspaceId, connectionId, platformSkuId } = input;
    const key = providerStockKey(workspaceId, connectionId, platformSkuId);
    this.state.providerStock.set(key, input.providerStock);
  }
}
