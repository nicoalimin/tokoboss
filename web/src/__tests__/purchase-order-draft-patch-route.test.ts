import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as postPurchaseOrder } from '../app/api/workspaces/[workspaceId]/catalog/purchase-orders/route';
import { PATCH as patchPurchaseOrder } from '../app/api/workspaces/[workspaceId]/catalog/purchase-orders/[purchaseOrderId]/route';

/**
 * PATCH catalog/purchase-orders/:purchaseOrderId route (UTA-146 slice
 * 1j-xi, Story 11) through the memory wiring: draft edit with CAS, stale
 * version, staff denial, body validation, and unknown purchase order.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';

function apiRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

interface DraftBody {
  purchaseOrder: {
    id: string;
    supplierName: string | null;
    notes: string | null;
    version: number;
  };
  items: Array<{
    variantId: string;
    quantity: number;
    unitCostCents: number | null;
  }>;
}

describe('PATCH catalog/purchase-orders/:purchaseOrderId route (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let staffToken: string;
  let variantId: string;
  let purchaseOrderId: string;

  async function signInToken(email: string, password: string): Promise<string> {
    const res = await signIn(
      apiRequest('/api/auth/sign-in', {
        email,
        password,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  function patch(token: string, id: string, body: unknown) {
    return patchPurchaseOrder(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/purchase-orders/${id}`,
        body,
        bearer(token),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, purchaseOrderId: id }) }
    );
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    adminToken = await signInToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    const params = { params: Promise.resolve({ workspaceId }) };
    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: STAFF_EMAIL, role: 'staff' },
        bearer(adminToken)
      ),
      params
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: STAFF_PASSWORD })
    );
    expect(accepted.status).toBe(200);
    staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);

    const created = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Kaos Polos',
          unit: 'pcs',
          variants: [
            {
              skuCode: 'KAOS-PO-PATCH-M',
              name: 'Merah / M',
              sellingPriceCents: 99000,
              hppCents: 45000,
              costSource: 'manual',
            },
          ],
        },
        bearer(adminToken)
      ),
      params
    );
    expect(created.status).toBe(201);
    const { product } = (await created.json()) as {
      product: { variants: Array<{ id: string }> };
    };
    variantId = product.variants[0]?.id ?? '';

    const draft = await postPurchaseOrder(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/purchase-orders`,
        {
          referenceNum: 'PO-PATCH-1',
          supplierName: 'CV Maju',
          items: [{ variantId, quantity: 5 }],
        },
        bearer(adminToken)
      ),
      params
    );
    expect(draft.status).toBe(201);
    purchaseOrderId = ((await draft.json()) as DraftBody).purchaseOrder.id;
  });

  it('edits a draft (200, version bump, nulls kept) and rejects a stale version (409)', async () => {
    const edited = await patch(adminToken, purchaseOrderId, {
      expectedVersion: 1,
      supplierName: '   ',
      notes: '  Kirim Senin  ',
      items: [{ variantId, quantity: 9, unitCostCents: 44000 }],
    });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as DraftBody;
    expect(body.purchaseOrder.version).toBe(2);
    expect(body.purchaseOrder.supplierName).toBeNull();
    expect(body.purchaseOrder.notes).toBe('Kirim Senin');
    expect(body.items[0]?.quantity).toBe(9);
    expect(body.items[0]?.unitCostCents).toBe(44000);

    const stale = await patch(adminToken, purchaseOrderId, {
      expectedVersion: 1,
      items: [{ variantId, quantity: 3 }],
    });
    expect(stale.status).toBe(409);
  });

  it('denies Staff (403), rejects empty items (400), and 404s an unknown purchase order', async () => {
    const denied = await patch(staffToken, purchaseOrderId, {
      expectedVersion: 1,
      items: [{ variantId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);

    const empty = await patch(adminToken, purchaseOrderId, {
      expectedVersion: 1,
      items: [],
    });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { errorCode: string }).errorCode).toBe(
      'CATALOG_VALIDATION'
    );

    const unknown = await patch(adminToken, 'po_does_not_exist', {
      expectedVersion: 1,
      items: [{ variantId, quantity: 1 }],
    });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { errorCode: string }).errorCode).toBe(
      'CATALOG_NOT_FOUND'
    );
  });
});
