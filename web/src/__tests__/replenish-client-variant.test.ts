import { describe, expect, it, vi } from 'vitest';
import type { VariantView } from '@tokoboss/contracts';
import {
  ReplenishClientError,
  getReplenishVariant,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 4g): GET one variant with
 * its replenish settings (prefills the Ambang form) over cookies, with
 * client-safe error mapping.
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
  return vi.fn(impl) as unknown as typeof fetch;
}

const VARIANT: VariantView = {
  id: 'v/1',
  workspaceId: 'ws 1',
  productId: 'p1',
  skuCode: 'KAOS-HITAM-M',
  name: 'Kaos Hitam M',
  barcode: null,
  sellingPriceCents: 75000,
  currency: 'IDR',
  hppCents: 40000,
  costSource: 'manual',
  listingName: null,
  status: 'active',
  version: 3,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T01:00:00.000Z',
  minStockQty: 10,
  leadTimeDays: 7,
  maxStockQty: null,
};

describe('replenish-client getReplenishVariant (UTA-147 slice 4g)', () => {
  it('GETs the variant over cookies with encoded ids', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ variant: VARIANT, storage: 'postgres' }, 200);
    });

    await expect(getReplenishVariant('ws 1', 'v/1', fetchFn)).resolves.toEqual(
      VARIANT
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe('/api/workspaces/ws%201/catalog/variants/v%2F1');
    expect(seen[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
    expect(seen[0]?.[1]?.body).toBeUndefined();
  });

  it('maps not-found and expired-session errors safely', async () => {
    const notFound = stubFetch(async () =>
      jsonResponse(
        { errorCode: 'VARIANT_NOT_FOUND', detail: 'SKU-RAHASIA-01' },
        404
      )
    );
    const err = await getReplenishVariant('ws', 'v1', notFound).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 404,
      errorCode: 'VARIANT_NOT_FOUND',
      needsReauth: false,
      message: 'Data tidak ditemukan.',
    });
    expect((err as Error).message).not.toContain('SKU-RAHASIA-01');

    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    await expect(
      getReplenishVariant('ws', 'v1', expired)
    ).rejects.toMatchObject({ status: 401, needsReauth: true });
  });
});
