import { describe, expect, it } from 'vitest';
import {
  createSkuMappingState,
  getSkuMappingOverview,
  type InMemorySkuListingRow,
  InMemorySkuMappingStore,
  type InMemorySkuVariantRow,
  mapStoreSku,
  type SkuMappingDeps,
} from '../sku-mapping';
import type { WorkspaceContext } from '../tenancy/tenancy-types';

/** getSkuMappingOverview unit tests (UTA-40 / US03, RFC 05 task 47). */
const WS = 'ws_overview_1';
const NOW = new Date('2026-10-28T05:00:00.000Z');

const ADMIN: WorkspaceContext = {
  workspaceId: WS,
  userId: 'user-admin',
  role: 'admin',
  warehouseScope: null,
  status: 'active',
  authVersion: 1,
};

/** variant('a') -> var-a / SKU-A with 10 on hand across active warehouses. */
function variant(
  x: string,
  linkedStockQtyByConnection: Record<string, number> = {}
): InMemorySkuVariantRow {
  const skuCode = `SKU-${x.toUpperCase()}`;
  return {
    workspaceId: WS,
    id: `var-${x}`,
    productId: `prod-${x}`,
    skuCode,
    barcode: null,
    status: 'active',
    archivedAt: null,
    productName: `Produk ${skuCode}`,
    variantName: null,
    totalStockQty: 10,
    linkedStockQtyByConnection,
  };
}

function listing(
  n: number,
  over: Partial<InMemorySkuListingRow> = {}
): InMemorySkuListingRow {
  const connectionId = over.connectionId ?? 'conn-1';
  return {
    workspaceId: WS,
    listingId: `lst-${n}`,
    connectionId,
    channel: 'shopee',
    shopExtId: `SHOP-${connectionId}`,
    connectionConnected: true,
    storeDisplayName: `Toko ${connectionId}`,
    externalItemId: `ITEM-${n}`,
    platformSkuId: `PSKU-${n}`,
    storeSkuText: `KAOS-${n}`,
    barcodeHint: null,
    title: `Kaos ${n}`,
    variantName: 'Hitam / L',
    listingStatus: 'NORMAL',
    providerStock: 10,
    mappingState: 'unmapped',
    suggestedVariantIds: [],
    candidateSkuCodes: [],
    lastSeenAt: NOW,
    ...over,
  };
}

/** Seeds the state, then maps each listingId -> variantId for real. */
async function setup(
  variants: InMemorySkuVariantRow[],
  listings: InMemorySkuListingRow[],
  maps: Record<string, string>
) {
  const state = createSkuMappingState({ variants, listings, now: () => NOW });
  const mem = new InMemorySkuMappingStore(state);
  const deps: SkuMappingDeps = {
    reads: mem,
    tx: mem,
    audit: { append: async () => undefined },
  };
  for (const [listingId, variantId] of Object.entries(maps)) {
    await mapStoreSku(deps, ADMIN, { workspaceId: WS, listingId, variantId });
  }
  return { state, deps };
}

describe('getSkuMappingOverview', () => {
  it('counts overview KPIs across mapped, review and unmapped rows', async () => {
    const { deps } = await setup(
      [variant('a'), variant('b'), variant('c')],
      [
        listing(1, { providerStock: 7 }),
        listing(2, {
          mappingState: 'suggested',
          suggestedVariantIds: ['var-b'],
        }),
        listing(3, {
          mappingState: 'ambiguous',
          suggestedVariantIds: ['var-b', 'var-c'],
        }),
        listing(4),
      ],
      { 'lst-1': 'var-a' }
    );
    const res = await getSkuMappingOverview(deps, ADMIN, { workspaceId: WS });

    expect(res.summary).toEqual({
      mappedStoreSkusCount: 1,
      needsReviewCount: 2,
      unmappedStoreSkusCount: 1,
      unmappedTokobossSkusCount: 2,
      stockConflictCount: 1,
    });
    expect(res.items.map((c) => [c.skuCode, c.reviewState])).toEqual([
      ['SKU-A', 'conflict'],
      ['SKU-B', 'needs_review'],
      ['SKU-C', 'needs_review'],
    ]);
    const open = res.unassignedListings.map((l) => l.listingId);
    expect(open).toEqual(['lst-2', 'lst-3', 'lst-4']);
  });

  it('detects pre-sync stock conflict per linked_warehouses vs all_active_warehouses', async () => {
    const { deps } = await setup(
      [variant('a', { 'conn-1': 4 })],
      [
        listing(1, { providerStock: 4 }),
        listing(2, { connectionId: 'conn-2', providerStock: 7 }),
      ],
      { 'lst-1': 'var-a', 'lst-2': 'var-a' }
    );
    const res = await getSkuMappingOverview(deps, ADMIN, { workspaceId: WS });
    const previews = res.items[0]!.mappings.map((m) => m.stockConflict);

    expect(previews).toEqual([
      {
        tokobossStockQty: 4,
        stockScope: 'linked_warehouses',
        providerStock: 4,
        hasStockConflict: false,
        stockDelta: 0,
      },
      {
        tokobossStockQty: 10,
        stockScope: 'all_active_warehouses',
        providerStock: 7,
        hasStockConflict: true,
        stockDelta: 3,
      },
    ]);
    expect(res.summary.stockConflictCount).toBe(1);
    expect(res.items[0]!.reviewState).toBe('conflict');
  });

  it('flags deleted, paused and renamed listings as lifecycle badges', async () => {
    const { state, deps } = await setup(
      [variant('a'), variant('b'), variant('c')],
      [listing(1), listing(2), listing(3)],
      { 'lst-1': 'var-a', 'lst-2': 'var-b', 'lst-3': 'var-c' }
    );
    state.listings[0]!.listingStatus = 'DELETED';
    state.listings[1]!.listingStatus = 'PAUSED';
    state.listings[2]!.title = 'Kaos 3 Edisi Baru';
    const res = await getSkuMappingOverview(deps, ADMIN, {
      workspaceId: WS,
      filter: 'issue',
    });

    expect(
      res.items.map((c) => [
        c.skuCode,
        c.reviewState,
        c.mappings[0]!.lifecycleIssue,
      ])
    ).toEqual([
      ['SKU-A', 'issue', 'listing_deleted'],
      ['SKU-B', 'issue', 'listing_paused'],
      ['SKU-C', 'issue', 'title_renamed'],
    ]);
    expect(res.items[2]!.mappings[0]).toMatchObject({
      listingName: 'Kaos 3',
      listingTitle: 'Kaos 3 Edisi Baru',
    });
  });
});
