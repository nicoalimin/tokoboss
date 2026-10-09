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
 * GET low-stock-recommendations ?budgetCents= (UTA-146 slice 1i-vi):
 * invalid → 400 CATALOG_VALIDATION; blank = no cap; 0 and N apply the cap.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';

type Variant = { id: string; skuCode: string; version: number };
type Rec = {
  skuCode: string;
  suggestedReorderQty: number;
  explainability: string[];
  missingHpp: boolean;
};

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

describe('low-stock-recommendations route budgetCents', () => {
  let workspaceId: string;
  let token: string;

  async function getList(query = '') {
    const res = await listLowStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/low-stock-recommendations${query}`,
        token,
        undefined,
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    return {
      status: res.status,
      body: (await res.json()) as {
        recommendations?: Rec[];
        errorCode?: string;
      },
    };
  }

  async function setMin(v: Variant, minStockQty: number) {
    const res = await patchReplenishSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${v.id}/replenish-settings`,
        token,
        { minStockQty, maxStockQty: null, expectedVersion: v.version },
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, variantId: v.id }) }
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

    const whRes = await createWarehouse(
      apiRequest(`/api/workspaces/${workspaceId}/catalog/warehouses`, token, {
        code: 'JKT-BG',
        name: 'Gudang JKT-BG',
      }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(whRes.status).toBe(201);
    const { warehouse } = (await whRes.json()) as {
      warehouse: { id: string };
    };

    const productRes = await createProduct(
      apiRequest(`/api/workspaces/${workspaceId}/catalog/products`, token, {
        name: 'Kaos Budget',
        unit: 'pcs',
        variants: [
          {
            skuCode: 'SKU-BG-A',
            name: 'Dengan HPP',
            sellingPriceCents: 9000,
            hppCents: 4000,
            costSource: 'manual',
          },
          {
            skuCode: 'SKU-BG-B',
            name: 'Tanpa HPP',
            sellingPriceCents: 5000,
          },
        ],
      }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(productRes.status).toBe(201);
    const { product } = (await productRes.json()) as {
      product: { variants: Variant[] };
    };
    const a = product.variants.find((v) => v.skuCode === 'SKU-BG-A')!;
    const b = product.variants.find((v) => v.skuCode === 'SKU-BG-B')!;
    await setMin(a, 10);
    await setMin(b, 5);

    const adj = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${a.id}/adjustments`,
        token,
        { warehouseId: warehouse.id, delta: 2, reason: 'seed' }
      ),
      { params: Promise.resolve({ workspaceId, variantId: a.id }) }
    );
    expect(adj.status).toBe(201);
  });

  it('rejects invalid budgetCents with 400 CATALOG_VALIDATION', async () => {
    for (const value of ['abc', '-1', '1.5']) {
      const { status, body } = await getList(`?budgetCents=${value}`);
      expect(status).toBe(400);
      expect(body.errorCode).toBe('CATALOG_VALIDATION');
    }
  });

  it('treats blank budgetCents as no cap and applies a positive budget', async () => {
    const noParam = await getList('');
    const blank = await getList('?budgetCents=');
    expect(noParam.status).toBe(200);
    expect(blank.status).toBe(200);
    const uncapped = noParam.body.recommendations!;
    expect(
      blank.body.recommendations!.map((r) => r.suggestedReorderQty)
    ).toEqual(uncapped.map((r) => r.suggestedReorderQty));
    expect(uncapped.map((r) => [r.skuCode, r.suggestedReorderQty])).toEqual([
      ['SKU-BG-A', 8],
      ['SKU-BG-B', 5],
    ]);

    const capped = await getList('?budgetCents=16000');
    expect(capped.status).toBe(200);
    const rows = capped.body.recommendations!;
    expect(rows.map((r) => r.suggestedReorderQty)).toEqual([4, 5]);
    expect(rows[0]!.explainability).toContain(
      'Saran dipotong plafon anggaran Rp 160: 8 → 4 unit'
    );
    expect(rows[1]!.explainability).toContain(
      'HPP kosong — saran ini tidak dihitung ke plafon anggaran'
    );
  });

  it('accepts budgetCents=0 and zeroes priced suggestions', async () => {
    const { status, body } = await getList('?budgetCents=0');
    expect(status).toBe(200);
    const rows = body.recommendations!;
    expect(rows.map((r) => r.suggestedReorderQty)).toEqual([0, 5]);
    expect(rows[0]!.explainability).toContain(
      'Saran dipotong plafon anggaran Rp 0: 8 → 0 unit'
    );
    expect(rows[1]!.missingHpp).toBe(true);
  });
});
