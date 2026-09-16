import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { POST as adjustStock } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments/route';
import { POST as archiveVariant } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/archive/route';
import {
  GET as listBundles,
  POST as createBundle,
} from '../app/api/workspaces/[workspaceId]/catalog/bundles/route';
import {
  DELETE as deleteBundle,
  GET as getBundle,
  PATCH as updateBundle,
} from '../app/api/workspaces/[workspaceId]/catalog/bundles/[bundleVariantId]/route';
import { POST as archiveBundle } from '../app/api/workspaces/[workspaceId]/catalog/bundles/[bundleVariantId]/archive/route';

/**
 * Bundle BOM Route Handler flow (UTA-79, Story 13) through the memory
 * wiring: create → detail/list → guards (cycles, versions, stock) →
 * archive, with RBAC, cross-workspace deny, and no-hard-delete at the
 * HTTP boundary.
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

describe('bundle routes (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let managerToken: string;
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

  async function seedVariant(token: string, skuCode: string) {
    const res = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: `Produk ${skuCode}`,
          variants: [{ skuCode, sellingPriceCents: 50000 }],
        },
        bearer(token)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      product: {
        variants: Array<{ id: string; skuCode: string; version: number }>;
      };
    };
    return body.product.variants[0] as {
      id: string;
      skuCode: string;
      version: number;
    };
  }

  async function seedBundleShell() {
    const bundle = await seedVariant(managerToken, 'BUNDLE-HEMAT');
    const compA = await seedVariant(managerToken, 'COMP-A');
    const compB = await seedVariant(managerToken, 'COMP-B');
    return { bundle, compA, compB };
  }

  async function createBom(
    token: string,
    bundleId: string,
    components: Array<{ componentVariantId: string; qty: number }>,
    expectedVersion: number
  ) {
    return createBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles`,
        { bundleVariantId: bundleId, components, expectedVersion },
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
  });

  it('creates a BOM and reads it back with availability', async () => {
    const { bundle, compA, compB } = await seedBundleShell();

    const created = await createBom(
      managerToken,
      bundle.id,
      [
        { componentVariantId: compA.id, qty: 2 },
        { componentVariantId: compB.id, qty: 1 },
      ],
      bundle.version
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      storage: string;
      bundle: {
        skuCode: string;
        version: number;
        components: Array<{ line: { qty: number }; componentSkuCode: string }>;
        availability: unknown[];
      };
    };
    expect(createdBody.storage).toBe('memory');
    expect(createdBody.bundle.skuCode).toBe('BUNDLE-HEMAT');
    expect(createdBody.bundle.version).toBe(2);
    expect(
      createdBody.bundle.components.map((c) => c.componentSkuCode).sort()
    ).toEqual(['COMP-A', 'COMP-B']);

    const detail = await getBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId, bundleVariantId: bundle.id }) }
    );
    expect(detail.status).toBe(200);

    const listed = await listBundles(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      bundles: Array<{ bundleVariantId: string }>;
    };
    expect(listedBody.bundles.map((b) => b.bundleVariantId)).toContain(
      bundle.id
    );
  });

  it('rejects duplicate BOMs, bad quantities, and stale versions', async () => {
    const { bundle, compA, compB } = await seedBundleShell();

    const zeroQty = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 0 }],
      bundle.version
    );
    expect(zeroQty.status).toBe(400);
    expect((await zeroQty.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_VALIDATION',
    });

    const created = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      bundle: { version: number };
    };

    const dupe = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compB.id, qty: 1 }],
      createdBody.bundle.version
    );
    expect(dupe.status).toBe(409);
    expect((await dupe.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_CONFLICT',
    });

    const stale = await updateBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        {
          components: [{ componentVariantId: compB.id, qty: 1 }],
          expectedVersion: bundle.version,
        },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, bundleVariantId: bundle.id }) }
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_VERSION_CONFLICT',
    });

    const updated = await updateBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        {
          components: [{ componentVariantId: compB.id, qty: 3 }],
          expectedVersion: createdBody.bundle.version,
        },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, bundleVariantId: bundle.id }) }
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as {
      bundle: { components: Array<{ line: { qty: number } }> };
    };
    expect(updatedBody.bundle.components[0]?.line.qty).toBe(3);
  });

  it('blocks self-reference and cycles with 422', async () => {
    const { bundle, compA } = await seedBundleShell();

    const selfRef = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: bundle.id, qty: 1 }],
      bundle.version
    );
    expect(selfRef.status).toBe(422);
    expect((await selfRef.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_CYCLE',
    });

    const created = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    expect(created.status).toBe(201);

    const cycle = await createBom(
      managerToken,
      compA.id,
      [{ componentVariantId: bundle.id, qty: 1 }],
      1
    );
    expect(cycle.status).toBe(422);
    expect((await cycle.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_CYCLE',
    });
  });

  it('denies staff writes but allows staff reads', async () => {
    const { bundle, compA } = await seedBundleShell();

    const denied = await createBom(
      staffToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    expect(denied.status).toBe(403);

    await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    const detail = await getBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId, bundleVariantId: bundle.id }) }
    );
    expect(detail.status).toBe(200);
  });

  it('denies cross-workspace access indistinguishably', async () => {
    const { bundle, compA } = await seedBundleShell();
    await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    const foreign = 'ws_foreign_0002';
    const res = await getBundle(
      apiRequest(
        `/api/workspaces/${foreign}/catalog/bundles/${bundle.id}`,
        undefined,
        bearer(adminToken),
        'GET'
      ),
      {
        params: Promise.resolve({
          workspaceId: foreign,
          bundleVariantId: bundle.id,
        }),
      }
    );
    expect(res.status).toBe(403);
  });

  it('holds no direct stock and blocks consumed-variant archives', async () => {
    const warehouseRes = await createWarehouse(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/warehouses`,
        { code: 'JKT-01', name: 'Gudang JKT' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(warehouseRes.status).toBe(201);
    const { warehouse } = (await warehouseRes.json()) as {
      warehouse: { id: string };
    };
    const { bundle, compA } = await seedBundleShell();
    const created = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 1 }],
      bundle.version
    );
    expect(created.status).toBe(201);

    const direct = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${bundle.id}/adjustments`,
        { warehouseId: warehouse.id, delta: 5, reason: 'bundle receipt' },
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId: bundle.id }) }
    );
    expect(direct.status).toBe(422);
    expect((await direct.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_NO_DIRECT_STOCK',
    });

    const blocked = await archiveVariant(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${compA.id}/archive`,
        {},
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId: compA.id }) }
    );
    expect(blocked.status).toBe(409);

    const componentStock = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${compA.id}/adjustments`,
        { warehouseId: warehouse.id, delta: 4, reason: 'component receipt' },
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId: compA.id }) }
    );
    expect(componentStock.status).toBe(201);
  });

  it('archives idempotently and never hard-deletes', async () => {
    const { bundle, compA } = await seedBundleShell();
    const created = await createBom(
      managerToken,
      bundle.id,
      [{ componentVariantId: compA.id, qty: 2 }],
      bundle.version
    );
    const createdBody = (await created.json()) as {
      bundle: { version: number };
    };
    const ctx = {
      params: Promise.resolve({ workspaceId, bundleVariantId: bundle.id }),
    };

    const archived = await archiveBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}/archive`,
        { expectedVersion: createdBody.bundle.version },
        bearer(managerToken)
      ),
      ctx
    );
    expect(archived.status).toBe(200);
    const archivedBody = (await archived.json()) as {
      bundle: { components: unknown[]; version: number };
    };
    expect(archivedBody.bundle.components).toEqual([]);

    const again = await archiveBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}/archive`,
        { expectedVersion: archivedBody.bundle.version },
        bearer(managerToken)
      ),
      ctx
    );
    expect(again.status).toBe(200);

    const gone = await getBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        undefined,
        bearer(managerToken),
        'GET'
      ),
      ctx
    );
    expect(gone.status).toBe(404);
    expect((await gone.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'BUNDLE_NOT_FOUND',
    });

    const noDelete = await deleteBundle(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/bundles/${bundle.id}`,
        undefined,
        bearer(adminToken),
        'DELETE'
      ),
      ctx
    );
    expect(noDelete.status).toBe(405);
  });
});
