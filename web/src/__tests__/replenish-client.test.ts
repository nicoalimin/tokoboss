import { describe, expect, it, vi } from 'vitest';
import type { LowStockRecommendationView } from '@tokoboss/contracts';
import {
  ReplenishClientError,
  listLowStockRecommendations,
  toReplenishClientError,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 2b): low-stock list over
 * cookies, optional budget query, and client-safe error mapping.
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

const REC: LowStockRecommendationView = {
  variantId: 'v1',
  workspaceId: 'ws 1',
  skuCode: 'SKU-RAHASIA-01',
  productName: 'Kaos Polos',
  variantName: 'Hitam / L',
  availableQty: 2,
  minStockQty: 10,
  leadTimeDays: 7,
  salesRatePerDay: 1.5,
  stockCoverDays: 1.3,
  suggestedReorderQty: 19,
  explainability: ['Stok di bawah minimum'],
  missingSupplier: false,
  missingHpp: false,
};

describe('replenish-client (UTA-147 slice 2b)', () => {
  it('lists recommendations over cookies with an optional budget query', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ recommendations: [REC] }, 200);
    });

    await expect(
      listLowStockRecommendations('ws 1', {}, fetchFn)
    ).resolves.toEqual([REC]);
    await listLowStockRecommendations('ws 1', { budgetCents: 500000 }, fetchFn);

    expect(seen[0]?.[0]).toBe(
      '/api/workspaces/ws%201/catalog/low-stock-recommendations'
    );
    expect(seen[1]?.[0]).toBe(
      '/api/workspaces/ws%201/catalog/low-stock-recommendations?budgetCents=500000'
    );
    for (const [, init] of seen) {
      expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    }

    const empty = stubFetch(async () => jsonResponse({}, 200));
    await expect(listLowStockRecommendations('ws', {}, empty)).resolves.toEqual(
      []
    );
  });

  it('maps failures to client-safe errors and flags expired sessions', async () => {
    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    const err = await listLowStockRecommendations('ws', {}, expired).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 401,
      errorCode: 'INVALID_SESSION',
      needsReauth: true,
      message: 'Sesi kamu sudah habis. Silakan masuk lagi.',
    });

    const forbidden = toReplenishClientError(403, {
      errorCode: 'FORBIDDEN',
      detail: 'SKU-RAHASIA-01 qty 19',
    });
    expect(forbidden.needsReauth).toBe(false);
    expect(forbidden.message).toBe(
      'Kamu tidak punya akses untuk tindakan ini.'
    );
    expect(forbidden.message).not.toContain('SKU-RAHASIA-01');

    const broken = stubFetch(
      async () => new Response('<html>bad gateway</html>', { status: 502 })
    );
    await expect(
      listLowStockRecommendations('ws', {}, broken)
    ).rejects.toMatchObject({
      status: 502,
      errorCode: 'REPLENISH_FAILED',
      needsReauth: false,
      message: 'Terjadi kesalahan. Coba lagi sebentar lagi.',
    });
  });
});
