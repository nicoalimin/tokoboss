import { describe, expect, it, vi } from 'vitest';
import {
  CatalogClientError,
  adjustStock,
  getLedger,
  getStockBalance,
  listWarehouses,
  getStockSettings,
} from '../lib/catalog-client';

/**
 * Web Stock Ledger UI (UTA-82): ledger list/filter + adjustments UI
 * matching the mockup and wired to UTA-81 APIs.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit?]> };
  };
}

const WS = 'ws_fixture_01';

describe('ledger-client (UTA-82 UI)', () => {
  it('lists ledger with warehouse filter', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      expect(url).toMatch(/\/ledger\?warehouseId=wh_1$/);
      return jsonResponse(
        {
          entries: [
            {
              id: 'led_1',
              workspaceId: WS,
              variantId: 'var_1',
              warehouseId: 'wh_1',
              delta: 10,
              balanceAfter: 10,
              reason: 'initial stock',
              actorId: null,
              correlationId: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        200
      );
    });

    const entries = await getLedger(WS, 'var_1', {
      warehouseId: 'wh_1',
      fetchFn,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 10, reason: 'initial stock' });
  });

  it('reads stock balance and warehouses for the multi-warehouse view', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      if (String(url).endsWith('/stock')) {
        return jsonResponse(
          {
            balance: {
              variantId: 'var_1',
              workspaceId: WS,
              totalQty: 25,
              perWarehouse: [
                {
                  warehouseId: 'wh_1',
                  qty: 15,
                  version: 1,
                },
                {
                  warehouseId: 'wh_2',
                  qty: 10,
                  version: 1,
                },
              ],
            },
          },
          200
        );
      }
      if (String(url).endsWith('/warehouses')) {
        return jsonResponse(
          {
            warehouses: [
              {
                id: 'wh_1',
                workspaceId: WS,
                code: 'JKT-01',
                name: 'Gudang JKT-01',
                status: 'active',
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'wh_2',
                workspaceId: WS,
                code: 'SBY-01',
                name: 'Gudang SBY-01',
                status: 'active',
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          200
        );
      }
      if (String(url).endsWith('/stock-settings')) {
        return jsonResponse(
          {
            settings: {
              workspaceId: WS,
              allowNegative: false,
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
          200
        );
      }
      return jsonResponse({}, 404);
    });

    const balance = await getStockBalance(WS, 'var_1', { fetchFn });
    expect(balance.totalQty).toBe(25);
    expect(balance.perWarehouse).toHaveLength(2);

    const warehouses = await listWarehouses(WS, { fetchFn });
    expect(warehouses).toHaveLength(2);
    expect(warehouses.map((w) => w.code)).toEqual(['JKT-01', 'SBY-01']);

    const settings = await getStockSettings(WS, { fetchFn });
    expect(settings.allowNegative).toBe(false);
  });

  it('adjusts stock with warehouse + delta + reason + idempotency key + expectedVersion', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      if (String(url).endsWith('/adjustments')) {
        return jsonResponse(
          {
            level: {
              variantId: 'var_1',
              warehouseId: 'wh_1',
              qty: 5,
              version: 2,
              updatedAt: new Date().toISOString(),
            },
            entry: {
              id: 'led_2',
              workspaceId: WS,
              variantId: 'var_1',
              warehouseId: 'wh_1',
              delta: -5,
              balanceAfter: 5,
              reason: 'damaged stock',
              actorId: null,
              correlationId: null,
              createdAt: new Date().toISOString(),
            },
          },
          201
        );
      }
      return jsonResponse({}, 404);
    });

    const { level, entry } = await adjustStock(
      WS,
      'var_1',
      {
        warehouseId: 'wh_1',
        delta: -5,
        reason: 'damaged stock',
        expectedVersion: 1,
        idempotencyKey: 'key_123',
      },
      { fetchFn }
    );
    expect(level.qty).toBe(5);
    expect(entry.balanceAfter).toBe(5);
  });

  it('maps CATALOG_INSUFFICIENT_STOCK to user-friendly message', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Insufficient stock.',
          errorCode: 'CATALOG_INSUFFICIENT_STOCK',
        },
        422
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      {
        warehouseId: 'wh_1',
        delta: -10,
        reason: 'overstock',
      },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_INSUFFICIENT_STOCK');
    // The message should not contain secret information
    expect(clientErr.message).not.toContain('insufficient');
  });

  it('maps CATALOG_WAREHOUSE_INACTIVE to user-friendly message', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Warehouse is inactive.',
          errorCode: 'CATALOG_WAREHOUSE_INACTIVE',
        },
        422
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      {
        warehouseId: 'wh_1',
        delta: -5,
        reason: 'test',
      },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_WAREHOUSE_INACTIVE');
    // The message should not contain secret information
    expect(clientErr.message).not.toContain('inactive');
  });

  it('maps CATALOG_VERSION_CONFLICT to user-friendly message', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Version conflict.',
          errorCode: 'CATALOG_VERSION_CONFLICT',
        },
        409
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      {
        warehouseId: 'wh_1',
        delta: -5,
        reason: 'test',
      },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_VERSION_CONFLICT');
    // The message should not contain secret information
    expect(clientErr.message).not.toContain('conflict');
  });

  it('uses same-origin credentials for all endpoints', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({}, 200);
    });

    await getLedger(WS, 'var_1', { fetchFn });
    await getStockBalance(WS, 'var_1', { fetchFn });
    await listWarehouses(WS, { fetchFn });
    await getStockSettings(WS, { fetchFn });

    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
  });
});
