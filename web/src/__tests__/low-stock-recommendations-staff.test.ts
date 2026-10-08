import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as adjustStock } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments/route';
import { PATCH as patchReplenishSettings } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/replenish-settings/route';
import { GET as listLowStock } from '../app/api/workspaces/[workspaceId]/catalog/low-stock-recommendations/route';

/**
 * GET low-stock-recommendations route for Staff (UTA-146 slice 1f-xi-c,
 * Story 11): Staff can read the list, and variants at or above their
 * minimum, or with no minimum set, are left out.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';

interface VariantBody {
  id: string;
  skuCode: string;
  version: number;
}

function apiRequest(
  path: string,
  body?: unknown,
  token?: string,
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('low-stock-recommendations route for Staff', () => {
  let workspaceId: string;
  let adminToken: string;
  let staffToken: string;

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

  async function setMin(variant: VariantBody, minStockQty: number) {
    const res = await patchReplenishSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variant.id}/replenish-settings`,
        { minStockQty, maxStockQty: null, expectedVersion: variant.version },
        adminToken,
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, variantId: variant.id }) }
    );
    expect(res.status).toBe(200);
  }

  async function addStock(variantId: string, warehouseId: string, qty: number) {
    const res = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId, delta: qty, reason: 'initial stock' },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(res.status).toBe(201);
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

    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: STAFF_EMAIL, role: 'staff' },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token: inviteToken } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', {
        token: inviteToken,
        newPassword: STAFF_PASSWORD,
      })
    );
    expect(accepted.status).toBe(200);
    staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);

    const warehouseRes = await createWarehouse(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/warehouses`,
        { code: 'JKT-LOW', name: 'Gudang JKT-LOW' },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(warehouseRes.status).toBe(201);
    const { warehouse } = (await warehouseRes.json()) as {
      warehouse: { id: string };
    };

    const productRes = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Kaos Polos',
          unit: 'pcs',
          variants: [
            {
              skuCode: 'KAOS-LOW-A',
              name: 'Merah / M',
              sellingPriceCents: 99000,
            },
            {
              skuCode: 'KAOS-LOW-C',
              name: 'Biru / M',
              sellingPriceCents: 99000,
            },
            {
              skuCode: 'KAOS-LOW-D',
              name: 'Biru / L',
              sellingPriceCents: 99000,
            },
            {
              skuCode: 'KAOS-LOW-E',
              name: 'Hijau / M',
              sellingPriceCents: 99000,
            },
          ],
        },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(productRes.status).toBe(201);
    const { product } = (await productRes.json()) as {
      product: { variants: VariantBody[] };
    };
    const bySku = new Map(product.variants.map((v) => [v.skuCode, v]));

    // A: min 10, 2 available → below min, listed.
    await setMin(bySku.get('KAOS-LOW-A')!, 10);
    await addStock(bySku.get('KAOS-LOW-A')!.id, warehouse.id, 2);
    // C: min 3, 5 available → above min, excluded.
    await setMin(bySku.get('KAOS-LOW-C')!, 3);
    await addStock(bySku.get('KAOS-LOW-C')!.id, warehouse.id, 5);
    // D: no min set, no stock → excluded.
    // E: min 4, 4 available → exactly at min, excluded.
    await setMin(bySku.get('KAOS-LOW-E')!, 4);
    await addStock(bySku.get('KAOS-LOW-E')!.id, warehouse.id, 4);
  });

  it('lets Staff read only the variant below its minimum', async () => {
    const res = await listLowStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/low-stock-recommendations`,
        undefined,
        staffToken,
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(200);
    const { recommendations } = (await res.json()) as {
      recommendations: { skuCode: string; availableQty: number }[];
    };
    expect(recommendations.map((r) => r.skuCode)).toEqual(['KAOS-LOW-A']);
    expect(recommendations[0]!.availableQty).toBe(2);
  });
});
