import { describe, expect, it, vi } from 'vitest';
import type {
  UpdateReplenishSettingsBody,
  VariantView,
} from '@tokoboss/contracts';
import {
  ReplenishClientError,
  updateReplenishSettings,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 4b): PATCH min stock /
 * lead time / max stock for one variant over cookies (CAS), with
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
  leadTimeDays: null,
  maxStockQty: 40,
};

const BODY: UpdateReplenishSettingsBody = {
  expectedVersion: 2,
  minStockQty: 10,
  leadTimeDays: null,
  maxStockQty: 40,
};

describe('replenish-client updateReplenishSettings (UTA-147 slice 4b)', () => {
  it('PATCHes the JSON body over cookies and returns the variant', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ variant: VARIANT, storage: 'postgres' }, 200);
    });

    await expect(
      updateReplenishSettings('ws 1', 'v/1', BODY, fetchFn)
    ).resolves.toEqual(VARIANT);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe(
      '/api/workspaces/ws%201/catalog/variants/v%2F1/replenish-settings'
    );
    expect(seen[0]?.[1]).toMatchObject({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(seen[0]?.[1]?.body))).toEqual(BODY);
  });

  it('maps forbidden, conflict and expired-session errors safely', async () => {
    const forbidden = stubFetch(async () =>
      jsonResponse({ errorCode: 'FORBIDDEN' }, 403)
    );
    await expect(
      updateReplenishSettings('ws', 'v1', BODY, forbidden)
    ).rejects.toMatchObject({
      status: 403,
      needsReauth: false,
      message: 'Kamu tidak punya akses untuk tindakan ini.',
    });

    const conflict = stubFetch(async () =>
      jsonResponse(
        { errorCode: 'VERSION_CONFLICT', detail: 'SKU-RAHASIA-01 v3' },
        409
      )
    );
    const err = await updateReplenishSettings('ws', 'v1', BODY, conflict).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 409,
      errorCode: 'VERSION_CONFLICT',
      message: 'Data sudah diubah orang lain. Muat ulang lalu coba lagi.',
    });
    expect((err as Error).message).not.toContain('SKU-RAHASIA-01');

    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    await expect(
      updateReplenishSettings('ws', 'v1', BODY, expired)
    ).rejects.toMatchObject({ status: 401, needsReauth: true });
  });
});
