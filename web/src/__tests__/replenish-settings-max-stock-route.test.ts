import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { PATCH as patchReplenishSettings } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/replenish-settings/route';
import { POST as bulkReplenishSettings } from '../app/api/workspaces/[workspaceId]/catalog/replenish-settings/bulk/route';

/**
 * maxStockQty through the replenish-settings routes (UTA-146 slice
 * 1f-viii, Story 11) via the memory wiring: PATCH set / keep / clear,
 * bulk set, validation, and staff denial at the HTTP boundary.
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

interface VariantBody {
  id: string;
  version: number;
  minStockQty: number | null;
  leadTimeDays: number | null;
  maxStockQty: number | null;
}

describe('replenish-settings routes maxStockQty (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let variants: VariantBody[];

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

  function patch(token: string, variantId: string, body: unknown) {
    return patchReplenishSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/replenish-settings`,
        body,
        bearer(token),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
  }

  function bulk(token: string, body: unknown) {
    return bulkReplenishSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/replenish-settings/bulk`,
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
              skuCode: 'KAOS-MAX-STOCK-M',
              name: 'Merah / M',
              sellingPriceCents: 99000,
              hppCents: 45000,
              costSource: 'manual',
            },
            {
              skuCode: 'KAOS-MAX-STOCK-L',
              name: 'Merah / L',
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
      product: { variants: VariantBody[] };
    };
    variants = product.variants;
    expect(variants).toHaveLength(2);
  });

  it('PATCH sets, keeps (when omitted), and clears maxStockQty', async () => {
    const variant = variants[0]!;
    expect(variant.maxStockQty).toBeNull();

    const set = await patch(managerToken, variant.id, {
      maxStockQty: 50,
      expectedVersion: variant.version,
    });
    expect(set.status).toBe(200);
    const setBody = (await set.json()) as { variant: VariantBody };
    expect(setBody.variant.id).toBe(variant.id);
    expect(setBody.variant.maxStockQty).toBe(50);
    expect(setBody.variant.minStockQty).toBe(variant.minStockQty);
    expect(setBody.variant.version).toBeGreaterThan(variant.version);

    const kept = await patch(managerToken, variant.id, {
      minStockQty: 5,
      expectedVersion: setBody.variant.version,
    });
    expect(kept.status).toBe(200);
    const keptBody = (await kept.json()) as { variant: VariantBody };
    expect(keptBody.variant.minStockQty).toBe(5);
    expect(keptBody.variant.maxStockQty).toBe(50);

    const cleared = await patch(managerToken, variant.id, {
      maxStockQty: null,
      expectedVersion: keptBody.variant.version,
    });
    expect(cleared.status).toBe(200);
    const clearedBody = (await cleared.json()) as { variant: VariantBody };
    expect(clearedBody.variant.maxStockQty).toBeNull();
    expect(clearedBody.variant.minStockQty).toBe(5);
  });

  it('bulk sets maxStockQty per item and returns it in each variant', async () => {
    const [first, second] = [variants[0]!, variants[1]!];

    const res = await bulk(managerToken, {
      items: [
        {
          variantId: first.id,
          maxStockQty: 60,
          expectedVersion: first.version,
        },
        {
          variantId: second.id,
          minStockQty: 5,
          maxStockQty: 25,
          expectedVersion: second.version,
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variants: VariantBody[] };
    expect(body.variants).toHaveLength(2);
    expect(body.variants.find((v) => v.id === first.id)?.maxStockQty).toBe(60);
    const secondView = body.variants.find((v) => v.id === second.id);
    expect(secondView?.maxStockQty).toBe(25);
    expect(secondView?.minStockQty).toBe(5);
  });

  it('rejects invalid maxStockQty (400) and denies Staff (403)', async () => {
    const variant = variants[0]!;

    const negative = await patch(managerToken, variant.id, {
      maxStockQty: -1,
      expectedVersion: variant.version,
    });
    expect(negative.status).toBe(400);
    const negativeBody = (await negative.json()) as { errorCode: string };
    expect(negativeBody.errorCode).toBe('CATALOG_VALIDATION');

    const fractional = await bulk(managerToken, {
      items: [
        {
          variantId: variant.id,
          maxStockQty: 2.5,
          expectedVersion: variant.version,
        },
      ],
    });
    expect(fractional.status).toBe(400);
    const fractionalBody = (await fractional.json()) as { errorCode: string };
    expect(fractionalBody.errorCode).toBe('CATALOG_VALIDATION');

    const denied = await patch(staffToken, variant.id, {
      maxStockQty: 10,
      expectedVersion: variant.version,
    });
    expect(denied.status).toBe(403);
  });
});
