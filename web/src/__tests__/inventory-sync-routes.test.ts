import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryInventorySyncStore,
  createInventorySyncState,
  type InventorySyncDeps,
} from '@tokoboss/application';
import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceStockPushInput,
} from '@tokoboss/domain';
import { __resetCatalogForTests } from '../lib/catalog';
import { setInventorySyncDepsForTesting } from '../lib/inventory-sync';
import {
  GET as overview,
  POST as bulkSync,
} from '../app/api/workspaces/[workspaceId]/inventory-sync/route';
import {
  PATCH as patchSync,
  POST as retryOne,
} from '../app/api/workspaces/[workspaceId]/sku-mappings/[mappingId]/sync/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as adjust } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments/route';
import {
  apiRequest as req,
  resetSkuMappingRoutes,
  seedCaller,
} from './sku-mapping-route-fixture';

/** Inventory-sync routes, memory wiring (UTA-37 / US04, RFC 06 task 45). */
// Fresh mapping id per test: the memory job store dedups (workspace, seq).
let MAP = '';
let seq = 0;
const LINK = { externalLocationId: 'loc-1', warehouseId: 'wh-1' };
type Json = Record<string, unknown> & { errorCode?: string };
const json = async (res: Response) => (await res.json()) as Json;
const at = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId, mappingId: MAP }),
});
const sync = (ws: string) => `/api/workspaces/${ws}/inventory-sync`;
const one = (ws: string) => `/api/workspaces/${ws}/sku-mappings/${MAP}/sync`;

/** Seeded sync store (one Shopee mapping, wh-1 = 9 linked) + fake connector. */
function seedSync(workspaceId: string, variantId = 'var-45') {
  const state = createInventorySyncState();
  state.mappings.push({
    mappingId: MAP,
    variantId,
    skuCode: 'KAOS-45',
    storeSkuText: 'KAOS-45-SHP',
    platformSkuId: 'model-45',
    channel: 'shopee',
    storeDisplayName: 'Toko Satu',
    workspaceId,
    connectionId: 'conn-45',
    connectionStatus: 'connected',
    shopExtId: 'SHP-45',
    externalItemId: 'item-45',
    warehouses: [
      { warehouseId: 'wh-1', warehouseStatus: 'active', onHandQty: 9 },
    ],
    locationLinks: [LINK],
  });
  const store = new InMemoryInventorySyncStore(state);
  const ctl = { fail: false };
  const pushInventory = vi.fn(
    async (_c: unknown, input: MarketplaceStockPushInput) => {
      if (ctl.fail) throw new MarketplaceConnectorError('auth_invalid', 'no');
      const ok = { success: true, errorKind: null, errorCode: null };
      const targets = input.targets.map((t) => ({ ...t, ...ok }));
      const pushedQty = targets.reduce((n, t) => n + t.quantity, 0);
      return { pushedQty, targets };
    }
  );
  const connector = { pushInventory } as unknown as MarketplaceConnector;
  const conn = { id: 'conn-45', status: 'connected', authExpiresAt: null };
  const deps: InventorySyncDeps = {
    reads: store,
    writes: store,
    connectors: { connectorFor: () => connector },
    tokenDeps: {
      connections: { find: async () => conn },
      vault: { open: async () => ({ secrets: {} }) },
      now: () => new Date(),
    } as unknown as InventorySyncDeps['tokenDeps'],
    audit: { append: async () => {} },
    now: () => new Date(),
    retryBackoffMs: 0,
  };
  setInventorySyncDepsForTesting(deps);
  return { state, store, ctl, pushInventory };
}

describe('inventory-sync routes (RFC 06 task 45)', () => {
  beforeEach(() => {
    MAP = `00000000-0000-4000-8000-00000000450${++seq}`;
    resetSkuMappingRoutes();
    __resetCatalogForTests();
  });
  afterEach(() => setInventorySyncDepsForTesting(null));

  it('404s non-members, 403s Staff on writes, lets Staff read', async () => {
    const staff = await seedCaller('staff');
    const outsider = await seedCaller('admin');
    const ws = staff.workspaceId;
    seedSync(ws);
    const hidden = [
      await overview(req(sync(ws), outsider.token), at(ws)),
      await patchSync(req(one(ws), outsider.token, 'PATCH', {}), at(ws)),
      await retryOne(req(one(ws), outsider.token, 'POST'), at(ws)),
    ];
    for (const res of hidden) {
      expect(res.status).toBe(404);
      expect((await json(res)).errorCode).toBe('WORKSPACE_NOT_AVAILABLE');
    }
    const [on, bulk] = [{ syncEnabled: true }, { mappingId: MAP }];
    const writes = [
      await patchSync(req(one(ws), staff.token, 'PATCH', on), at(ws)),
      await retryOne(req(one(ws), staff.token, 'POST'), at(ws)),
      await bulkSync(req(sync(ws), staff.token, 'POST', bulk), at(ws)),
    ];
    for (const res of writes) {
      expect(res.status).toBe(403);
      expect((await json(res)).errorCode).toBe('ROLE_FORBIDDEN');
    }
    const read = await overview(req(sync(ws), staff.token), at(ws));
    expect(read.status).toBe(200);
  });

  it('PATCH enables sync with buffer/allocation and pushes immediately', async () => {
    const { workspaceId: ws, token } = await seedCaller('admin');
    const { state, pushInventory } = seedSync(ws);
    const body = { syncEnabled: true, stockBuffer: 1, allocationPct: 50 };
    const res = await patchSync(req(one(ws), token, 'PATCH', body), at(ws));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      synced: true,
      state: { syncEnabled: true, stockBuffer: 1, allocationPct: 50 },
    });
    // floor(9 * 50%) - 1 = 3 on the linked location.
    expect(pushInventory).toHaveBeenCalledTimes(1);
    const want = [{ ...LINK, sellableQty: 9, quantity: 3 }];
    expect(pushInventory.mock.calls[0]![1].targets).toEqual(want);
    expect(state.states.get(MAP)?.syncStatus).toBe('synced');
  });

  it('stock adjustment pushes; failure surfaces in attention, retry recovers', async () => {
    const { workspaceId: ws, token } = await seedCaller('admin');
    const cat = `/api/workspaces/${ws}/catalog`;
    const wsAt = { params: Promise.resolve({ workspaceId: ws }) };
    const post = (path: string, body: unknown) =>
      req(`${cat}${path}`, token, 'POST', body);
    const wh = { code: 'JKT', name: 'JKT' };
    const made = await createWarehouse(post('/warehouses', wh), wsAt);
    const warehouseId = ((await json(made)).warehouse as { id: string }).id;
    const variants = [{ skuCode: 'KAOS-45', name: 'A', sellingPriceCents: 1 }];
    const product = { name: 'Kaos', unit: 'pcs', variants };
    const res = await createProduct(post('/products', product), wsAt);
    const p = (await json(res)).product as { variants: { id: string }[] };
    const variantId = p.variants[0]!.id;
    const { store, ctl, pushInventory } = seedSync(ws, variantId);
    const on = { syncEnabled: true, stockBuffer: 0, allocationPct: 100 };
    await store.upsertSettings({ workspaceId: ws, mappingId: MAP, ...on });
    ctl.fail = true;
    const delta = { warehouseId, delta: 5, reason: 'Stok masuk' };
    const path = `/variants/${variantId}/adjustments`;
    const vAt = { params: Promise.resolve({ workspaceId: ws, variantId }) };
    const adjusted = await adjust(post(path, delta), vAt);
    expect(adjusted.status).toBe(201);
    expect(pushInventory).toHaveBeenCalled();
    const flagged = await json(await overview(req(sync(ws), token), wsAt));
    expect(flagged.attention).toEqual([
      expect.objectContaining({ mappingId: MAP, remediation: 'reauth_store' }),
    ]);

    ctl.fail = false;
    const body = { mappingId: MAP };
    const retry = await bulkSync(req(sync(ws), token, 'POST', body), wsAt);
    expect(await json(retry)).toEqual({ synced: true });
    const healed = await json(await overview(req(sync(ws), token), wsAt));
    expect(healed.attention).toEqual([]);
    expect(healed.states).toEqual([
      expect.objectContaining({ mappingId: MAP, syncStatus: 'synced' }),
    ]);
  });
});
