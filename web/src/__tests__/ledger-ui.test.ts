import { describe, expect, it, vi } from 'vitest';
import {
  CatalogClientError,
  adjustStock,
  getLedger,
} from '../lib/catalog-client';
import { getCatalogCopy } from '../lib/catalog-copy';

describe('Stock Ledger UI', () => {
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

  it('handles insufficient stock error during adjustment', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Insufficient stock available for this warehouse.',
          errorCode: 'CATALOG_INSUFFICIENT_STOCK',
        },
        422
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      { warehouseId: 'wh_1', delta: 7, reason: 'initial stock' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_INSUFFICIENT_STOCK');
    expect(clientErr.message).toBe(getCatalogCopy('en').insufficientStockError);
  });

  it('handles inactive warehouse error during adjustment', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Warehouse is inactive. Please select an active warehouse.',
          errorCode: 'CATALOG_WAREHOUSE_INACTIVE',
        },
        422
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      { warehouseId: 'wh_1', delta: 7, reason: 'initial stock' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_WAREHOUSE_INACTIVE');
  });

  it('handles version conflict error during adjustment', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          errorCode: 'CATALOG_VERSION_CONFLICT',
        },
        409
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      { warehouseId: 'wh_1', delta: 7, reason: 'initial stock' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_VERSION_CONFLICT');
    expect(clientErr.message).toBe(getCatalogCopy('en').versionConflictError);
  });

  it('handles general adjustment error', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Check the highlighted fields and try again.',
          errorCode: 'CATALOG_VALIDATION',
        },
        400
      )
    );

    const err = await adjustStock(
      WS,
      'var_1',
      { warehouseId: 'wh_1', delta: 7, reason: 'initial stock' },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_VALIDATION');
    expect(clientErr.message).toBe(getCatalogCopy('en').validationError);
  });

  it('reads ledger entries successfully', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      if (String(url).endsWith('/ledger')) {
        return jsonResponse(
          {
            entries: [
              {
                id: 'led_1',
                workspaceId: WS,
                variantId: 'var_1',
                warehouseId: 'wh_1',
                delta: 7,
                balanceAfter: 7,
                reason: 'initial stock',
                actorId: null,
                correlationId: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
          200
        );
      }
      return jsonResponse({}, 404);
    });

    const entries = await getLedger(WS, 'var_1', { fetchFn });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 7, reason: 'initial stock' });
  });
});
