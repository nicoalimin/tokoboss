import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceStockPushInput,
} from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { createInventorySyncState } from '../in-memory-inventory-sync-state';
import { InMemoryInventorySyncStore } from '../in-memory-inventory-sync-store';
import type { InventorySyncDeps } from '../inventory-sync-ports';
import type { InventorySyncTrigger } from '../inventory-sync-types';
import {
  listInventorySyncOverview,
  syncVariantInventory,
} from '../sync-variant-inventory';
import { updateMappingSyncSettings } from '../update-mapping-sync-settings';

/** Story 04 inventory sync use cases (UTA-37 / US04, RFC 06 task 28). */
const NOW = new Date('2026-10-28T05:00:00.000Z');
const WS = 'ws_sync_1';
const KEY = `${WS}:conn-1:model-1`;
const admin = { role: 'admin', status: 'active', userId: 'u-1' };
const ctx = { ...admin, workspaceId: WS } as WorkspaceContext;
const wh = (warehouseId: string, onHandQty: number) => ({
  warehouseId,
  warehouseStatus: 'active' as const,
  onHandQty,
});
const LINK = { externalLocationId: 'loc-1', warehouseId: 'wh-1' };

function setup(onPush: (input: MarketplaceStockPushInput) => void = () => {}) {
  const state = createInventorySyncState({ now: () => NOW });
  state.mappings.push({
    mappingId: 'map-1',
    variantId: 'var-1',
    skuCode: 'KAOS-M',
    storeSkuText: 'KAOS-M-SHP',
    platformSkuId: 'model-1',
    channel: 'shopee',
    storeDisplayName: 'Toko Satu',
    workspaceId: WS,
    connectionId: 'conn-1',
    connectionStatus: 'connected',
    shopExtId: 'SHP-1',
    externalItemId: 'item-1',
    warehouses: [wh('wh-1', 9), wh('wh-2', 2)],
    locationLinks: [LINK],
  });
  const store = new InMemoryInventorySyncStore(state);
  const pushInventory = vi.fn(
    async (_ctx: unknown, input: MarketplaceStockPushInput) => {
      onPush(input);
      const targets = input.targets.map((t) => ({
        ...t,
        success: true,
        errorKind: null,
        errorCode: null,
      }));
      const pushedQty = targets.reduce((sum, t) => sum + t.quantity, 0);
      return { pushedQty, targets };
    }
  );
  const connector = { pushInventory } as unknown as MarketplaceConnector;
  // Connected row, non-OAuth: ensureFreshAccessToken returns fresh, no refresh.
  const conn = { id: 'conn-1', status: 'connected', authExpiresAt: null };
  const audit: string[] = [];
  const deps: InventorySyncDeps = {
    reads: store,
    writes: store,
    connectors: { connectorFor: () => connector },
    tokenDeps: {
      connections: { find: async () => conn },
      vault: { open: async () => ({ secrets: {} }) },
      now: () => NOW,
    } as unknown as InventorySyncDeps['tokenDeps'],
    audit: { append: async (e) => void audit.push(e.action) },
    now: () => NOW,
    retryBackoffMs: 0,
  };
  return { deps, state, store, pushInventory, audit };
}

const enable = (deps: InventorySyncDeps, extra = {}) =>
  updateMappingSyncSettings(deps, ctx, {
    workspaceId: WS,
    mappingId: 'map-1',
    syncEnabled: true,
    ...extra,
  });
const run = async (
  deps: InventorySyncDeps,
  trigger: InventorySyncTrigger = 'config_change'
) => {
  const input = { workspaceId: WS, mappingId: 'map-1', trigger };
  const [result] = await syncVariantInventory(deps, input);
  return result;
};
const attentionOf = async (deps: InventorySyncDeps) =>
  (await listInventorySyncOverview(deps, ctx, { workspaceId: WS })).attention;

describe('inventory sync use cases', () => {
  it('pushes the exact clamped stock and updates provider_stock', async () => {
    const { deps, state, pushInventory, audit } = setup();
    const { state: row } = await enable(deps, {
      stockBuffer: 1,
      allocationPct: 50,
    });
    expect(row).toMatchObject({ syncStatus: 'syncing', syncSeq: 1 });
    // Linked wh-1 only: floor(9 * 50%) - 1 = 3; unlinked wh-2 is not pushed.
    expect(await run(deps)).toMatchObject({ outcome: 'synced', pushedQty: 3 });
    expect(pushInventory.mock.calls[0]![1]).toEqual({
      externalItemId: 'item-1',
      platformSkuId: 'model-1',
      targets: [{ ...LINK, sellableQty: 9, quantity: 3 }],
    });
    expect(state.providerStock.get(KEY)).toBe(3);
    expect(state.states.get('map-1')).toMatchObject({
      syncStatus: 'synced',
      lastPushedQty: 3,
      lastPushedSeq: 1,
    });

    await enable(deps, { stockBuffer: 20 }); // buffer > stock clamps to 0
    expect(await run(deps)).toMatchObject({ outcome: 'synced', pushedQty: 0 });
    expect(state.providerStock.get(KEY)).toBe(0);
    expect(audit.filter((a) => a === 'inventory_sync.pushed')).toHaveLength(2);
  });

  it('never lets a stale syncSeq overwrite newer stock', async () => {
    const ctl = setup(() => {
      if (ctl.pushInventory.mock.calls.length > 1) return;
      // A stock change lands mid-flight: fresh level + newer syncSeq.
      ctl.state.mappings[0]!.warehouses = [wh('wh-1', 4)];
      void ctl.store.markSyncing({ workspaceId: WS, mappingId: 'map-1' });
    });
    const { deps, state, pushInventory } = ctl;
    await enable(deps);
    expect(await run(deps)).toMatchObject({ outcome: 'synced', pushedQty: 4 });
    expect(pushInventory).toHaveBeenCalledTimes(2);
    const log = state.events.map((e) => [e.syncSeq, e.outcome, e.pushedQty]);
    expect(log).toEqual([
      [1, 'skipped_stale', 9],
      [2, 'synced', 4],
    ]);
    expect(state.states.get('map-1')).toMatchObject({
      syncStatus: 'synced',
      syncSeq: 2,
      lastPushedSeq: 2,
      lastPushedQty: 4,
    });
    expect(state.providerStock.get(KEY)).toBe(4);
  });

  it('flags needs_attention with a calm reason; manual retry recovers', async () => {
    let failWith: MarketplaceConnectorError | null = null;
    const { deps, state } = setup(() => {
      if (failWith) throw failWith;
    });
    const mapping = state.mappings[0]!;
    await enable(deps);
    const cases = [
      ['auth_invalid', 'SYNC_NEEDS_REAUTH', 'reauth_store', /perlu diperbarui/],
      ['bad_request', 'SYNC_LISTING_INVALID', 'check_listing', /menolak/],
      [null, 'SYNC_LOCATION_UNLINKED', 'link_warehouse', /belum ditautkan/],
    ] as const;
    for (const [kind, errorCode, remediation, reason] of cases) {
      failWith = kind && new MarketplaceConnectorError(kind, 'nope');
      if (!kind) mapping.locationLinks = [{ ...LINK, warehouseId: null }];
      const result = await run(deps);
      expect(result).toMatchObject({ outcome: 'needs_attention', errorCode });
      const attention = await attentionOf(deps);
      expect(attention).toHaveLength(1);
      expect(attention[0]).toMatchObject({ skuCode: 'KAOS-M', remediation });
      expect(attention[0]!.reason).toMatch(reason);
    }

    mapping.locationLinks = [LINK];
    const retried = await run(deps, 'manual_retry');
    expect(retried).toMatchObject({ outcome: 'synced', pushedQty: 9 });
    expect(state.states.get('map-1')).toMatchObject({
      syncStatus: 'synced',
      lastErrorCode: null,
    });
    expect(await attentionOf(deps)).toEqual([]);
  });
});
