import {
  createInventorySyncState,
  type InMemoryInventorySyncState,
  type InMemorySyncMapping,
} from './in-memory-inventory-sync-state';
import type { InventorySyncFailureCode } from './inventory-sync-errors';
import { inventorySyncFailure } from './inventory-sync-errors';
import type {
  InventorySyncReadStore,
  InventorySyncScope,
} from './inventory-sync-ports';
import type { InventorySyncAttentionBannerItem } from './inventory-sync-types';

/**
 * In-memory InventorySyncReadStore test fake (UTA-37 / US04, RFC 06 task
 * 26b) over the seedable state (26a). Workspace-scoped like Drizzle:
 * unseeded or other-workspace mappings miss (null / empty). Returns copies.
 */
export class InMemoryInventorySyncReadStore implements InventorySyncReadStore {
  constructor(
    readonly state: InMemoryInventorySyncState = createInventorySyncState()
  ) {}

  /** Mappings matching every filter set on the scope. */
  protected mappingsIn(scope: InventorySyncScope): InMemorySyncMapping[] {
    return this.state.mappings.filter(
      (m) =>
        m.workspaceId === scope.workspaceId &&
        (!scope.mappingId || m.mappingId === scope.mappingId) &&
        (!scope.variantIds || scope.variantIds.includes(m.variantId)) &&
        (!scope.connectionId || m.connectionId === scope.connectionId)
    );
  }

  async loadMappingContext(workspaceId: string, mappingId: string) {
    const [m] = this.mappingsIn({ workspaceId, mappingId });
    const state = this.state.states.get(mappingId);
    return m ? { ...m, state: state ? { ...state } : null } : null;
  }

  async listSyncEnabledMappingIds(scope: InventorySyncScope) {
    return this.mappingsIn(scope)
      .filter((m) => this.state.states.get(m.mappingId)?.syncEnabled)
      .map((m) => m.mappingId);
  }

  async listStates(scope: InventorySyncScope) {
    return this.mappingsIn(scope).flatMap((m) => {
      const state = this.state.states.get(m.mappingId);
      return state ? [{ ...state }] : [];
    });
  }

  /** needs_attention rows with a calm reason + remediation, newest first. */
  async listAttention(scope: InventorySyncScope) {
    const items: InventorySyncAttentionBannerItem[] = [];
    for (const m of this.mappingsIn(scope)) {
      const s = this.state.states.get(m.mappingId);
      if (s?.syncStatus !== 'needs_attention' || !s.lastErrorCode) continue;
      const { reason, remediation } = inventorySyncFailure(
        s.lastErrorCode as InventorySyncFailureCode
      );
      items.push({
        mappingId: m.mappingId,
        variantId: m.variantId,
        skuCode: m.skuCode,
        storeSkuText: m.storeSkuText,
        platformSkuId: m.platformSkuId,
        channel: m.channel,
        storeDisplayName: m.storeDisplayName,
        errorCode: s.lastErrorCode,
        reason: s.lastErrorMessage ?? reason,
        remediation,
        updatedAt: s.updatedAt,
      });
    }
    return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
