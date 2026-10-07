import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as postPurchaseOrder } from '../app/api/workspaces/[workspaceId]/catalog/purchase-orders/route';

/**
 * POST catalog/purchase-orders route (UTA-146 slice 1d-v-c, Story 11)
 * through the memory wiring: draft create, duplicate referenceNum,
 * staff denial, body validation, and unknown variant at the HTTP boundary.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const MANAGER_EMAIL = 'manager@fixture.test';
const MANAGER_PASSWORD = 'manager-noodles-88';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';

function apiRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

interface PurchaseOrderDraftBody {
  purchaseOrder: {
    id: string;
    workspaceId: string;
    referenceNum: string;
    status: string;
    supplierName: string | null;
    notes: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  items: Array<{
    purchaseOrderId: string;
    variantId: string;
    quantity: number;
    unitCostCents: number | null;
    version: number;
  }>;
  storage: string;
}

describe('POST catalog/purchase-orders route (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let variantId: string;

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
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  async function provisionUser(
    email: string,
    role: 'manager' | 'staff',
    password: string
  ): Promise<void> {
    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email, role },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: password })
    );
    expect(accepted.status).toBe(200);
  }

  function post(token: string, body: unknown) {
    return postPurchaseOrder(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/purchase-orders`,
        body,
        bearer(token)
      ),
      { params: Promise.resolve({ workspaceId }) }
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
    await provisionUser(MANAGER_EMAIL, 'manager', MANAGER_PASSWORD);
    await provisionUser(STAFF_EMAIL, 'staff', STAFF_PASSWORD);
    managerToken = await signInToken(MANAGER_EMAIL, MANAGER_PASSWORD);
    staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);

    const created = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Kaos Polos',
          unit: 'pcs',
          variants: [
            {
              skuCode: 'KAOS-PO-DRAFT-M',
              name: 'Merah / M',
              sellingPriceCents: 99000,
              hppCents: 45000,
              costSource: 'manual',
            },
          ],
        },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(created.status).toBe(201);
    const { product } = (await created.json()) as {
      product: { variants: Array<{ id: string }> };
    };
    variantId = product.variants[0]?.id ?? '';
  });

  it('Manager creates a draft (201) and a duplicate referenceNum gets 409', async () => {
    const created = await post(managerToken, {
      referenceNum: '  PO-0001  ',
      supplierName: '  CV Maju  ',
      items: [{ variantId, quantity: 12 }],
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as PurchaseOrderDraftBody;
    expect(body.storage).toBe('memory');
    expect(body.purchaseOrder.workspaceId).toBe(workspaceId);
    expect(body.purchaseOrder.referenceNum).toBe('PO-0001');
    expect(body.purchaseOrder.status).toBe('draft');
    expect(body.purchaseOrder.supplierName).toBe('CV Maju');
    expect(body.purchaseOrder.notes).toBeNull();
    expect(body.purchaseOrder.version).toBe(1);
    expect(Number.isNaN(Date.parse(body.purchaseOrder.createdAt))).toBe(false);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.purchaseOrderId).toBe(body.purchaseOrder.id);
    expect(body.items[0]?.variantId).toBe(variantId);
    expect(body.items[0]?.quantity).toBe(12);
    expect(body.items[0]?.unitCostCents).toBeNull();

    const duplicate = await post(managerToken, {
      referenceNum: 'PO-0001',
      items: [{ variantId, quantity: 1, unitCostCents: 45000 }],
    });
    expect(duplicate.status).toBe(409);
    const duplicateBody = (await duplicate.json()) as { errorCode: string };
    expect(duplicateBody.errorCode).toBe('CATALOG_CONFLICT');
  });

  it('denies Staff (403), rejects invalid bodies (400), and 404s an unknown variant', async () => {
    const denied = await post(staffToken, {
      referenceNum: 'PO-0002',
      items: [{ variantId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);

    const emptyItems = await post(managerToken, {
      referenceNum: 'PO-0003',
      items: [],
    });
    expect(emptyItems.status).toBe(400);
    const emptyItemsBody = (await emptyItems.json()) as { errorCode: string };
    expect(emptyItemsBody.errorCode).toBe('CATALOG_VALIDATION');

    const zeroQty = await post(managerToken, {
      referenceNum: 'PO-0004',
      items: [{ variantId, quantity: 0 }],
    });
    expect(zeroQty.status).toBe(400);

    const malformed = await postPurchaseOrder(
      new Request(
        `http://localhost/api/workspaces/${workspaceId}/catalog/purchase-orders`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...bearer(managerToken),
          },
          body: '{not json',
        }
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(malformed.status).toBe(400);
    const malformedBody = (await malformed.json()) as { errorCode: string };
    expect(malformedBody.errorCode).toBe('CATALOG_VALIDATION');

    const unknownVariant = await post(managerToken, {
      referenceNum: 'PO-0005',
      items: [{ variantId: 'var_does_not_exist', quantity: 1 }],
    });
    expect(unknownVariant.status).toBe(404);
    const unknownBody = (await unknownVariant.json()) as { errorCode: string };
    expect(unknownBody.errorCode).toBe('CATALOG_NOT_FOUND');
  });
});
