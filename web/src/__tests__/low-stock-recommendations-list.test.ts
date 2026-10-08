import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as adjustStock } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments/route';
import { PATCH as patchReplenishSettings } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/replenish-settings/route';
import { GET as listLowStock } from '../app/api/workspaces/[workspaceId]/catalog/low-stock-recommendations/route';

/**
 * GET low-stock-recommendations route listing (UTA-146 slice 1f-xi-b,
 * Story 11): an Admin sees below-min variants sorted by SKU, with the
 * max-stock cap and the missing-HPP flag in the explainability.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';

interface VariantBody {
  id: string;
  skuCode: string;
  version: number;
}

interface RecommendationBody {
  skuCode: string;
  availableQty: number;
  minStockQty: number;
  suggestedReorderQty: number;
  explainability: string[];
  missingHpp: boolean;
}

function apiRequest(
  path: string,
  token: string,
  body?: unknown,
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('low-stock-recommendations route listing', () => {
  let workspaceId: string;
  let token: string;

  async function setReplenish(
    variant: VariantBody,
    minStockQty: number,
    maxStockQty: number | null
  ): Promise<void> {
    const res = await patchReplenishSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variant.id}/replenish-settings`,
        token,
        { minStockQty, maxStockQty, expectedVersion: variant.version },
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, variantId: variant.id }) }
    );
    expect(res.status).toBe(200);
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    const signInRes = await signIn(
      new Request('http://localhost/api/auth/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          workspaceId,
          platform: 'mobile',
        }),
      })
    );
    expect(signInRes.status).toBe(200);
    ({ token } = (await signInRes.json()) as { token: string });

    const warehouseRes = await createWarehouse(
      apiRequest(`/api/workspaces/${workspaceId}/catalog/warehouses`, token, {
        code: 'JKT-LOW',
        name: 'Gudang JKT-LOW',
      }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(warehouseRes.status).toBe(201);
    const { warehouse } = (await warehouseRes.json()) as {
      warehouse: { id: string };
    };

    const productRes = await createProduct(
      apiRequest(`/api/workspaces/${workspaceId}/catalog/products`, token, {
        name: 'Kaos Polos',
        unit: 'pcs',
        variants: [
          {
            skuCode: 'KAOS-LOW-B',
            name: 'Merah / L',
            sellingPriceCents: 99000,
          },
          {
            skuCode: 'KAOS-LOW-A',
            name: 'Merah / M',
            sellingPriceCents: 99000,
            hppCents: 45000,
            costSource: 'manual',
          },
        ],
      }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(productRes.status).toBe(201);
    const { product } = (await productRes.json()) as {
      product: { variants: VariantBody[] };
    };
    const a = product.variants.find((v) => v.skuCode === 'KAOS-LOW-A')!;
    const b = product.variants.find((v) => v.skuCode === 'KAOS-LOW-B')!;

    // A: min 10, max 6, 2 available → capped suggestion of 4.
    await setReplenish(a, 10, 6);
    const adjustRes = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${a.id}/adjustments`,
        token,
        { warehouseId: warehouse.id, delta: 2, reason: 'initial stock' }
      ),
      { params: Promise.resolve({ workspaceId, variantId: a.id }) }
    );
    expect(adjustRes.status).toBe(201);
    // B: min 5, no stock, no HPP → suggestion 5, HPP flagged.
    await setReplenish(b, 5, null);
  });

  it('lists below-min variants sorted by SKU with cap and HPP flags', async () => {
    const res = await listLowStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/low-stock-recommendations`,
        token,
        undefined,
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(200);
    const { recommendations } = (await res.json()) as {
      recommendations: RecommendationBody[];
    };
    expect(recommendations.map((r) => r.skuCode)).toEqual([
      'KAOS-LOW-A',
      'KAOS-LOW-B',
    ]);

    const [a, b] = [recommendations[0]!, recommendations[1]!];
    expect(a.availableQty).toBe(2);
    expect(a.minStockQty).toBe(10);
    expect(a.suggestedReorderQty).toBe(4);
    expect(a.missingHpp).toBe(false);
    expect(a.explainability).toContain('Saran dibatasi stok maksimum: 6 unit');

    expect(b.availableQty).toBe(0);
    expect(b.minStockQty).toBe(5);
    expect(b.suggestedReorderQty).toBe(5);
    expect(b.missingHpp).toBe(true);
    expect(b.explainability).toContain('HPP belum diisi — tidak dibuat-buat');
  });
});
