import { describe, expect, it } from 'vitest';
import {
  bulkMapStoreSkus,
  createSkuMappingState,
  type InMemorySkuListingRow,
  InMemorySkuMappingStore,
  type InMemorySkuVariantRow,
  mapStoreSku,
  SKU_MAPPING_ERROR_HTTP_STATUS,
  type SkuMappingDeps,
  unmapStoreSku,
} from '../sku-mapping';
import type { WorkspaceContext } from '../tenancy/tenancy-types';

/** bulkMapStoreSkus + unmapStoreSku unit tests (UTA-40 / US03, RFC 05 task 46). */
const WS = 'ws_bulk_1';
const NOW = new Date('2026-10-28T04:00:00.000Z');
type AuditEntry = Parameters<SkuMappingDeps['audit']['append']>[0];
type MatchState = InMemorySkuListingRow['mappingState'];

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

function listing(
  n: number,
  storeSkuText: string,
  mappingState: MatchState,
  suggestedVariantIds: string[]
): InMemorySkuListingRow {
  return {
    workspaceId: WS,
    listingId: `lst-${n}`,
    connectionId: 'conn-1',
    channel: 'shopee',
    shopExtId: 'SHOP-1',
    connectionConnected: true,
    storeDisplayName: 'Toko Satu',
    externalItemId: `ITEM-${n}`,
    platformSkuId: `PSKU-${n}`,
    storeSkuText,
    barcodeHint: null,
    title: `Kaos ${n}`,
    variantName: 'Hitam / L',
    listingStatus: 'NORMAL',
    providerStock: 5,
    mappingState,
    suggestedVariantIds,
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

describe('bulkMapStoreSkus', () => {
  it('bulk-maps single suggested matches in one batch', async () => {
    const { state, deps, audits } = setup([
      listing(1, 'SKU-A', 'suggested', ['var-a']),
      listing(2, 'SKU-B', 'suggested', ['var-b']),
    ]);
    const res = await bulkMapStoreSkus(deps, ADMIN, {
      workspaceId: WS,
      items: [
        { listingId: 'lst-1', variantId: 'var-a' },
        { listingId: 'lst-2', variantId: 'var-b' },
      ],
    });

    expect(res.mappedCount).toBe(2);
    expect(res.mappings.map((m) => m.variantId)).toEqual(['var-a', 'var-b']);
    expect(state.listings.map((l) => l.mappingState)).toEqual([
      'mapped',
      'mapped',
    ]);
    expect(state.events.map((e) => [e.action, e.source])).toEqual([
      ['bulk_mapped', 'suggested_bulk'],
      ['bulk_mapped', 'suggested_bulk'],
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'sku_mapping.bulk_mapped',
      payload: { count: 2, connectionIds: ['conn-1'] },
    });
  });

  it('rejects a batch containing an ambiguous match with 422 and writes nothing', async () => {
    const { state, deps, audits } = setup([
      listing(1, 'SKU-A', 'suggested', ['var-a']),
      listing(2, 'KAOS-2', 'ambiguous', ['var-a', 'var-b']),
    ]);
    const err = await bulkMapStoreSkus(deps, ADMIN, {
      workspaceId: WS,
      items: [
        { listingId: 'lst-1', variantId: 'var-a' },
        { listingId: 'lst-2', variantId: 'var-a' },
      ],
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({
      code: 'SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW',
      details: { platformSkuIds: ['PSKU-2'] },
    });
    expect(
      SKU_MAPPING_ERROR_HTTP_STATUS.SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW
    ).toBe(422);
    expect(state.mappings).toHaveLength(0);
    expect(state.events).toHaveLength(0);
    expect(state.listings.map((l) => l.mappingState)).toEqual([
      'suggested',
      'ambiguous',
    ]);
    expect(audits).toHaveLength(0);
  });
});

describe('unmapStoreSku', () => {
  it('unmap recomputes the staged listing mapping_state and records history', async () => {
    const { state, deps, audits } = setup([
      listing(1, 'SKU-A', 'suggested', ['var-a']),
    ]);
    const mapped = await mapStoreSku(deps, ADMIN, {
      workspaceId: WS,
      listingId: 'lst-1',
      variantId: 'var-a',
    });
    expect(state.listings[0]!.mappingState).toBe('mapped');

    const res = await unmapStoreSku(deps, ADMIN, {
      workspaceId: WS,
      mappingId: mapped.mapping.id,
    });

    expect(res).toMatchObject({
      deleted: true,
      recomputedMappingState: 'suggested',
    });
    expect(res.mapping.id).toBe(mapped.mapping.id);
    expect(state.mappings[0]!.archivedAt).toEqual(NOW);
    expect(state.listings[0]).toMatchObject({
      mappingState: 'suggested',
      suggestedVariantIds: ['var-a'],
    });
    expect(state.events.map((e) => e.action)).toEqual(['mapped', 'unmapped']);
    expect(state.events[1]).toMatchObject({
      mappingId: mapped.mapping.id,
      variantId: 'var-a',
      platformSkuId: 'PSKU-1',
      source: 'manual',
    });
    expect(audits.map((a) => a.action)).toEqual([
      'sku_mapping.mapped',
      'sku_mapping.unmapped',
    ]);
  });
});
