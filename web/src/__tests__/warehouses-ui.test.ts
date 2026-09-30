import { describe, expect, it, vi } from 'vitest';
import {
  CatalogClientError,
  createWarehouse,
  updateWarehouse,
  toCatalogClientError,
} from '../lib/catalog-client';

/**
 * Warehouse client (UTA-134): create + update wired to catalog warehouse APIs,
 * happy paths and error mapping — Vitest stubFetch pattern (no DOM).
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

function warehouseFixture(overrides = {}) {
  return {
    id: 'wh_1',
    workspaceId: WS,
    code: 'WH-A',
    name: 'Gudang A',
    status: 'active' as const,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('warehouse-client (UTA-134)', () => {
  it('createWarehouse POSTs to /warehouses with code+name and returns WarehouseView', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/warehouses`);
      expect(url.endsWith('/warehouses')).toBe(true);
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ code: 'WH-NEW', name: 'Gudang Baru' });
      return jsonResponse(
        {
          warehouse: warehouseFixture({ code: 'WH-NEW', name: 'Gudang Baru' }),
        },
        201
      );
    });

    const result = await createWarehouse(
      WS,
      { code: 'WH-NEW', name: 'Gudang Baru' },
      { fetchFn }
    );
    expect(result.code).toBe('WH-NEW');
    expect(result.name).toBe('Gudang Baru');
    expect(result.status).toBe('active');
  });

  it('updateWarehouse rename PATCHes with expectedVersion + name', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/warehouses/wh_1`);
      expect(url.includes('wh_1')).toBe(true);
      expect(init?.method).toBe('PATCH');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ expectedVersion: 2, name: 'Gudang Renamed' });
      return jsonResponse(
        {
          warehouse: warehouseFixture({
            name: 'Gudang Renamed',
            version: 3,
          }),
        },
        200
      );
    });

    const result = await updateWarehouse(
      WS,
      'wh_1',
      { expectedVersion: 2, name: 'Gudang Renamed' },
      { fetchFn }
    );
    expect(result.name).toBe('Gudang Renamed');
    expect(result.version).toBe(3);
  });

  it('updateWarehouse deactivate sends expectedVersion + status deactivated', async () => {
    const fetchFn = stubFetch(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        expectedVersion: 1,
        status: 'deactivated',
      });
      return jsonResponse(
        {
          warehouse: warehouseFixture({
            status: 'deactivated',
            version: 2,
          }),
        },
        200
      );
    });

    const result = await updateWarehouse(
      WS,
      'wh_1',
      { expectedVersion: 1, status: 'deactivated' },
      { fetchFn }
    );
    expect(result.status).toBe('deactivated');
  });

  it('maps 409 version conflict to CatalogClientError without secrets', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Version conflict.',
          errorCode: 'CATALOG_VERSION_CONFLICT',
        },
        409
      )
    );

    const err = await updateWarehouse(
      WS,
      'wh_1',
      { expectedVersion: 1, name: 'X' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.status).toBe(409);
    expect(clientErr.errorCode).toBe('CATALOG_VERSION_CONFLICT');
    expect(JSON.stringify(err)).not.toMatch(/Bearer|tb_session|passwordHash/);
  });

  it('maps 400 validation to CatalogClientError without secrets', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Validation failed.',
          errorCode: 'CATALOG_VALIDATION',
        },
        400
      )
    );

    const err = await createWarehouse(
      WS,
      { code: '', name: '' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.status).toBe(400);
    expect(JSON.stringify(err)).not.toMatch(/Bearer|tb_session|passwordHash/);
  });

  it('toCatalogClientError maps 401 INVALID_SESSION to needsReauth', () => {
    const err = toCatalogClientError(401, { errorCode: 'INVALID_SESSION' });
    expect(err.needsReauth).toBe(true);
    expect(err.status).toBe(401);
  });
});
