import { describe, expect, it } from 'vitest';
import {
  createSkuMappingState,
  type InMemorySkuListingRow,
  InMemorySkuMappingStore,
  type InMemorySkuVariantRow,
  mapStoreSku,
  type SkuMappingDeps,
} from '../sku-mapping';
import type { WorkspaceContext } from '../tenancy/tenancy-types';

/** mapStoreSku unit tests (UTA-40 / US03, RFC 05 task 45). */
const WS = 'ws_map_1';
const NOW = new Date('2026-10-28T03:00:00.000Z');
type AuditEntry = Parameters<SkuMappingDeps['audit']['append']>[0];

const ADMIN: WorkspaceContext = {
  workspaceId: WS,
  userId: 'user-admin',
  role: 'admin',
  warehouseScope: null,
  status: 'active',
  authVersion: 1,
};

function variant(id: string, skuCode: string): InMemorySkuVariantRow {
  return {
    workspaceId: WS,
    id,
    productId: `prod-${id}`,
    skuCode,
    barcode: null,
    status: 'active',
    archivedAt: null,
    productName: `Produk ${skuCode}`,
    variantName: null,
    totalStockQty: 10,
    linkedStockQtyByConnection: {},
  };
}

function listing(n: number, connectionId = 'conn-1'): InMemorySkuListingRow {
  return {
    workspaceId: WS,
    listingId: `lst-${n}`,
    connectionId,
    channel: 'shopee',
    shopExtId: `SHOP-${connectionId}`,
    connectionConnected: true,
    storeDisplayName: 'Toko Satu',
    externalItemId: `ITEM-${n}`,
    platformSkuId: `PSKU-${n}`,
    storeSkuText: `KAOS-${n}`,
    barcodeHint: null,
    title: `Kaos ${n}`,
    variantName: 'Hitam / L',
    listingStatus: 'NORMAL',
    providerStock: 5,
    mappingState: 'unmapped',
    suggestedVariantIds: [],
    candidateSkuCodes: [],
    lastSeenAt: NOW,
  };
}

function setup(listings: InMemorySkuListingRow[]) {
  const state = createSkuMappingState({
    variants: [variant('var-a', 'SKU-A'), variant('var-b', 'SKU-B')],
    listings,
    now: () => NOW,
  });
  const store = new InMemorySkuMappingStore(state);
  const audits: AuditEntry[] = [];
  const deps: SkuMappingDeps = {
    reads: store,
    tx: store,
    audit: { append: async (entry) => void audits.push(entry) },
  };
  return { state, deps, audits };
}

const input = (listingId: string, variantId: string) => ({
  workspaceId: WS,
  listingId,
  variantId,
});

describe('mapStoreSku', () => {
  it('maps a single staged listing and keeps externalItemId + platformSkuId', async () => {
    const { state, deps, audits } = setup([listing(1)]);
    const res = await mapStoreSku(deps, ADMIN, input('lst-1', 'var-a'));

    expect(res).toMatchObject({ outcome: 'mapped', created: true });
    expect(res.mapping).toMatchObject({
      variantId: 'var-a',
      connectionId: 'conn-1',
      externalItemId: 'ITEM-1',
      platformSkuId: 'PSKU-1',
      shopExtId: 'SHOP-conn-1',
      sellerSkuHint: 'KAOS-1',
      mappedBy: 'user-admin',
      version: 1,
    });
    expect(state.listings[0]!.mappingState).toBe('mapped');
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      action: 'mapped',
      source: 'manual',
      previousVariantId: null,
      externalItemId: 'ITEM-1',
      platformSkuId: 'PSKU-1',
    });
    expect(audits.map((a) => a.action)).toEqual(['sku_mapping.mapped']);
  });

  it('maps many Store SKUs to one SKU TokoBoss', async () => {
    const { state, deps } = setup([listing(1), listing(2, 'conn-2')]);
    await mapStoreSku(deps, ADMIN, input('lst-1', 'var-a'));
    await mapStoreSku(deps, ADMIN, input('lst-2', 'var-a'));

    expect(state.mappings).toHaveLength(2);
    expect(state.mappings.map((m) => m.variantId)).toEqual(['var-a', 'var-a']);
    expect(state.mappings.map((m) => m.platformSkuId)).toEqual([
      'PSKU-1',
      'PSKU-2',
    ]);
    expect(state.listings.map((l) => l.mappingState)).toEqual([
      'mapped',
      'mapped',
    ]);
    expect(state.events.map((e) => e.action)).toEqual(['mapped', 'mapped']);
  });

  it('409 SKU_MAPPING_ALREADY_ASSIGNED without allowRemap; remaps with history', async () => {
    const { state, deps, audits } = setup([listing(1)]);
    await mapStoreSku(deps, ADMIN, input('lst-1', 'var-a'));

    await expect(
      mapStoreSku(deps, ADMIN, input('lst-1', 'var-b'))
    ).rejects.toMatchObject({
      code: 'SKU_MAPPING_ALREADY_ASSIGNED',
      details: {
        currentVariantId: 'var-a',
        currentSkuCode: 'SKU-A',
        currentVersion: 1,
      },
    });
    expect(state.mappings[0]).toMatchObject({ variantId: 'var-a', version: 1 });
    expect(state.events).toHaveLength(1);

    const res = await mapStoreSku(deps, ADMIN, {
      ...input('lst-1', 'var-b'),
      allowRemap: true,
      expectedVersion: 1,
    });
    expect(res).toMatchObject({ outcome: 'remapped', created: false });
    expect(res.mapping).toMatchObject({ variantId: 'var-b', version: 2 });
    expect(state.mappings).toHaveLength(1);
    expect(state.events.map((e) => e.action)).toEqual(['mapped', 'remapped']);
    expect(state.events[1]).toMatchObject({
      variantId: 'var-b',
      previousVariantId: 'var-a',
    });
    expect(audits.map((a) => a.action)).toEqual([
      'sku_mapping.mapped',
      'sku_mapping.remapped',
    ]);
  });
});
