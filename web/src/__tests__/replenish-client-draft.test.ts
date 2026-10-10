import { describe, expect, it, vi } from 'vitest';
import type {
  PurchaseOrderWithItemsView,
  UpdatePurchaseOrderDraftBody,
} from '@tokoboss/contracts';
import {
  ReplenishClientError,
  updatePurchaseOrderDraft,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 2h): PATCH a DRAFT
 * purchase order over cookies (CAS), with client-safe error mapping.
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
    id: 'po/1',
    workspaceId: 'ws 1',
    referenceNum: 'PO-2026-001',
    status: 'draft',
    supplierName: 'Toko Sumber',
    notes: 'Kirim Senin',
    version: 2,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T01:00:00.000Z',
  },
  items: [
    {
      id: 'poi1',
      purchaseOrderId: 'po/1',
      workspaceId: 'ws 1',
      variantId: 'v1',
      quantity: 8,
      unitCostCents: 1500,
      version: 1,
      createdAt: '2026-10-10T01:00:00.000Z',
      updatedAt: '2026-10-10T01:00:00.000Z',
    },
  ],
};

const BODY: UpdatePurchaseOrderDraftBody = {
  expectedVersion: 1,
  supplierName: 'Toko Sumber',
  notes: 'Kirim Senin',
  items: [{ variantId: 'v1', quantity: 8, unitCostCents: 1500 }],
};

describe('replenish-client updatePurchaseOrderDraft (UTA-147 slice 2h)', () => {
  it('PATCHes the JSON body over cookies and returns the draft PO', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ ...PO, storage: 'postgres' }, 200);
    });

    await expect(
      updatePurchaseOrderDraft('ws 1', 'po/1', BODY, fetchFn)
    ).resolves.toEqual(PO);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe(
      '/api/workspaces/ws%201/catalog/purchase-orders/po%2F1'
    );
    expect(seen[0]?.[1]).toMatchObject({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(seen[0]?.[1]?.body))).toEqual(BODY);

    const noItems = stubFetch(async () =>
      jsonResponse({ purchaseOrder: PO.purchaseOrder }, 200)
    );
    await expect(
      updatePurchaseOrderDraft('ws 1', 'po/1', BODY, noItems)
    ).resolves.toEqual({ purchaseOrder: PO.purchaseOrder, items: [] });
  });

  it('maps version conflicts and expired sessions to client-safe errors', async () => {
    const conflict = stubFetch(async () =>
      jsonResponse(
        { errorCode: 'VERSION_CONFLICT', detail: 'SKU-RAHASIA-01 x8' },
        409
      )
    );
    const err = await updatePurchaseOrderDraft(
      'ws',
      'po1',
      BODY,
      conflict
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 409,
      errorCode: 'VERSION_CONFLICT',
      needsReauth: false,
      message: 'Data sudah diubah orang lain. Muat ulang lalu coba lagi.',
    });
    expect((err as Error).message).not.toContain('SKU-RAHASIA-01');

    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    await expect(
      updatePurchaseOrderDraft('ws', 'po1', BODY, expired)
    ).rejects.toMatchObject({ status: 401, needsReauth: true });
  });
});
