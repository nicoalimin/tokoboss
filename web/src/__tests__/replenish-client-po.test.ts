import { describe, expect, it, vi } from 'vitest';
import type {
  CreatePurchaseOrderDraftBody,
  PurchaseOrderWithItemsView,
} from '@tokoboss/contracts';
import {
  ReplenishClientError,
  createPurchaseOrderDraft,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 2f): POST a draft
 * purchase order over cookies, with client-safe error mapping.
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

const PO: PurchaseOrderWithItemsView = {
  purchaseOrder: {
    id: 'po1',
    workspaceId: 'ws 1',
    referenceNum: 'PO-2026-001',
    status: 'draft',
    supplierName: null,
    notes: null,
    version: 1,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  },
  items: [
    {
      id: 'poi1',
      purchaseOrderId: 'po1',
      workspaceId: 'ws 1',
      variantId: 'v1',
      quantity: 12,
      unitCostCents: null,
      version: 1,
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
    },
  ],
};

const BODY: CreatePurchaseOrderDraftBody = {
  referenceNum: 'PO-2026-001',
  supplierName: null,
  items: [{ variantId: 'v1', quantity: 12, unitCostCents: null }],
};

describe('replenish-client createPurchaseOrderDraft (UTA-147 slice 2f)', () => {
  it('POSTs the JSON body over cookies and returns the draft PO', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ ...PO, storage: 'postgres' }, 201);
    });

    await expect(
      createPurchaseOrderDraft('ws 1', BODY, fetchFn)
    ).resolves.toEqual(PO);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe('/api/workspaces/ws%201/catalog/purchase-orders');
    expect(seen[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(seen[0]?.[1]?.body))).toEqual(BODY);

    const noItems = stubFetch(async () =>
      jsonResponse({ purchaseOrder: PO.purchaseOrder }, 201)
    );
    await expect(
      createPurchaseOrderDraft('ws 1', BODY, noItems)
    ).resolves.toEqual({ purchaseOrder: PO.purchaseOrder, items: [] });
  });

  it('maps forbidden and expired sessions to client-safe errors', async () => {
    const forbidden = stubFetch(async () =>
      jsonResponse(
        { errorCode: 'FORBIDDEN', detail: 'SKU-RAHASIA-01 x12' },
        403
      )
    );
    const err = await createPurchaseOrderDraft('ws', BODY, forbidden).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 403,
      errorCode: 'FORBIDDEN',
      needsReauth: false,
      message: 'Kamu tidak punya akses untuk tindakan ini.',
    });
    expect((err as Error).message).not.toContain('SKU-RAHASIA-01');

    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    await expect(
      createPurchaseOrderDraft('ws', BODY, expired)
    ).rejects.toMatchObject({ status: 401, needsReauth: true });
  });
});
