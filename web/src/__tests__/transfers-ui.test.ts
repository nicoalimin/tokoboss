import { describe, expect, it, vi } from 'vitest';
import {
  CatalogClientError,
  createTransferDraft,
  listTransfers,
  toCatalogClientError,
} from '../lib/catalog-client';

/**
 * Transfer client (UTA-129): list + createDraft wired to UTA-94 APIs,
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

function transferFixture(overrides = {}) {
  return {
    id: 'trf_1',
    workspaceId: WS,
    referenceNum: 'TRF-001',
    sourceWarehouseId: 'wh_1',
    destWarehouseId: 'wh_2',
    status: 'draft' as const,
    notes: null,
    expectedReceiveDate: null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('transfer-client (UTA-129)', () => {
  it('lists transfers with same-origin credentials and maps the array', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/transfers`);
      expect(init?.credentials).toBe('same-origin');
      return jsonResponse(
        {
          transfers: [
            transferFixture({ referenceNum: 'TRF-001' }),
            transferFixture({
              id: 'trf_2',
              referenceNum: 'TRF-002',
              status: 'sent',
            }),
          ],
        },
        200
      );
    });

    const transfers = await listTransfers(WS, { fetchFn });
    expect(transfers).toHaveLength(2);
    expect(transfers[0]?.referenceNum).toBe('TRF-001');
    expect(transfers[0]?.status).toBe('draft');
    expect(transfers[1]?.referenceNum).toBe('TRF-002');
    expect(transfers[1]?.status).toBe('sent');
  });

  it('returns empty array when transfers key is missing', async () => {
    const fetchFn = stubFetch(async () => jsonResponse({}, 200));

    const transfers = await listTransfers(WS, { fetchFn });
    expect(transfers).toEqual([]);
  });

  it('createTransferDraft POST body includes required fields', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/transfers`);
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body.referenceNum).toBe('TRF-NEW');
      expect(body.sourceWarehouseId).toBe('wh_a');
      expect(body.destWarehouseId).toBe('wh_b');
      expect(body.notes).toBeUndefined();
      expect(body.expectedReceiveDate).toBeUndefined();
      return jsonResponse(
        { transfer: transferFixture({ referenceNum: 'TRF-NEW' }) },
        201
      );
    });

    const result = await createTransferDraft(
      WS,
      {
        referenceNum: 'TRF-NEW',
        sourceWarehouseId: 'wh_a',
        destWarehouseId: 'wh_b',
      },
      { fetchFn }
    );
    expect(result.referenceNum).toBe('TRF-NEW');
    expect(result.status).toBe('draft');
  });

  it('createTransferDraft includes optional notes and expectedReceiveDate when provided', async () => {
    const fetchFn = stubFetch(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.referenceNum).toBe('TRF-OPT');
      expect(body.notes).toBe('Urgent restock');
      expect(body.expectedReceiveDate).toBe('2026-10-01T08:00:00.000Z');
      return jsonResponse(
        {
          transfer: transferFixture({
            referenceNum: 'TRF-OPT',
            notes: 'Urgent restock',
            expectedReceiveDate: '2026-10-01T08:00:00.000Z',
          }),
        },
        201
      );
    });

    const result = await createTransferDraft(
      WS,
      {
        referenceNum: 'TRF-OPT',
        sourceWarehouseId: 'wh_1',
        destWarehouseId: 'wh_2',
        notes: 'Urgent restock',
        expectedReceiveDate: '2026-10-01T08:00:00.000Z',
      },
      { fetchFn }
    );
    expect(result.notes).toBe('Urgent restock');
    expect(result.expectedReceiveDate).toBe('2026-10-01T08:00:00.000Z');
  });

  it('maps 422 validation error through toCatalogClientError with no secrets', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Validation failed.',
          errorCode: 'CATALOG_VALIDATION',
        },
        422
      )
    );

    const err = await createTransferDraft(
      WS,
      {
        referenceNum: '',
        sourceWarehouseId: 'wh_1',
        destWarehouseId: 'wh_2',
      },
      { fetchFn }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.status).toBe(422);
    expect(clientErr.errorCode).toBe('CATALOG_VALIDATION');
    expect(JSON.stringify(err)).not.toMatch(/Bearer|tb_session|passwordHash/);
  });

  it('maps 403 forbidden through toCatalogClientError with no secrets', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Forbidden.',
          errorCode: 'TENANCY_FORBIDDEN',
        },
        403
      )
    );

    const err = await listTransfers(WS, { fetchFn }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.status).toBe(403);
    expect(clientErr.errorCode).toBe('TENANCY_FORBIDDEN');
    expect(JSON.stringify(err)).not.toMatch(/Bearer|tb_session/);
  });

  it('uses same-origin credentials for all transfer endpoints', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      if (String(url).endsWith('/transfers') && init?.method === 'POST') {
        return jsonResponse(
          { transfer: transferFixture({ referenceNum: 'TRF-TEST' }) },
          201
        );
      }
      return jsonResponse({ transfers: [transferFixture()] }, 200);
    });

    await listTransfers(WS, { fetchFn });
    await createTransferDraft(
      WS,
      {
        referenceNum: 'TRF-TEST',
        sourceWarehouseId: 'wh_1',
        destWarehouseId: 'wh_2',
      },
      { fetchFn }
    );

    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(seen).toHaveLength(2);
  });

  it('toCatalogClientError maps 401 INVALID_SESSION to needsReauth', () => {
    const err = toCatalogClientError(401, { errorCode: 'INVALID_SESSION' });
    expect(err.needsReauth).toBe(true);
    expect(err.status).toBe(401);
  });
});
