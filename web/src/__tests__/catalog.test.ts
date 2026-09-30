import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import {
  GET as listProducts,
  POST as createProduct,
} from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import {
  DELETE as deleteProduct,
  GET as getProduct,
  PATCH as updateProduct,
} from '../app/api/workspaces/[workspaceId]/catalog/products/[productId]/route';
import { POST as archiveProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/[productId]/archive/route';
import {
  GET as getVariant,
  PATCH as updateVariant,
} from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/route';
import { POST as adjustStock } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments/route';
import { GET as getLedger } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/ledger/route';
import { GET as getStockBalance } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/stock/route';
import {
  GET as getStockSettings,
  PUT as updateStockSettings,
} from '../app/api/workspaces/[workspaceId]/catalog/stock-settings/route';
import {
  GET as listMappings,
  POST as createMapping,
} from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/mappings/route';
import {
  GET as listWarehouses,
  POST as createWarehouse,
} from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { PATCH as updateWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/[warehouseId]/route';
import { GET as searchCatalog } from '../app/api/workspaces/[workspaceId]/catalog/search/route';
import {
  GET as listTransfers,
  POST as createTransfer,
} from '../app/api/workspaces/[workspaceId]/catalog/transfers/route';
import { GET as getTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/route';
import { POST as addTransferItems } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/items/route';
import { POST as sendTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/send/route';
import { POST as receiveTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/receive/route';
import { POST as cancelTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/cancel/route';

/**
 * Catalog Route Handler flow (UTA-75, Story 01) through the memory
 * wiring: warehouse → product+variants → adjustments/ledger → search →
 * archive, with RBAC, cross-workspace deny, duplicate-SKU paths,
 * optimistic concurrency, and no-hard-delete asserted at HTTP boundary.
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

describe('catalog routes (memory wiring)', () => {
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

  async function seedWarehouse(token: string, code = 'JKT-01') {
    const res = await createWarehouse(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/warehouses`,
        { code, name: `Gudang ${code}` },
        bearer(token)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(201);
    return (await res.json()) as {
      warehouse: { id: string; code: string; version: number };
    };
  }

  async function seedProduct(token: string, skuCode = 'KAOS-MERAH-M') {
    const res = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Kaos Polos',
          unit: 'pcs',
          variants: [
            {
              skuCode,
              name: 'Merah / M',
              barcode: '8991234500001',
              sellingPriceCents: 99000,
              hppCents: 45000,
              costSource: 'manual',
              listingName: 'Kaos Polos Merah M',
            },
          ],
        },
        bearer(token)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(201);
    return (await res.json()) as {
      product: {
        id: string;
        version: number;
        variants: Array<{
          id: string;
          skuCode: string;
          version: number;
          productId: string;
        }>;
      };
    };
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

  it('creates warehouses and products; duplicates carry the existing path', async () => {
    await seedWarehouse(adminToken);
    const { product } = await seedProduct(managerToken);
    expect(product.variants[0]?.skuCode).toBe('KAOS-MERAH-M');

    const dupe = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Dupe',
          variants: [{ skuCode: 'KAOS-MERAH-M', sellingPriceCents: 1 }],
        },
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(dupe.status).toBe(409);
    const dupeBody = (await dupe.json()) as {
      errorCode: string;
      details: { existingPath: string; existingVariantId: string };
    };
    expect(dupeBody.errorCode).toBe('CATALOG_CONFLICT');
    expect(dupeBody.details.existingPath).toContain(
      `/api/workspaces/${workspaceId}/catalog/products/${product.id}`
    );
    expect(dupeBody.details.existingVariantId).toBe(product.variants[0]?.id);
  });

  it('denies staff writes but allows staff reads; managers adjust stock', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';

    const denied = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Staff product',
          variants: [{ skuCode: 'X-1', sellingPriceCents: 1 }],
        },
        bearer(staffToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(denied.status).toBe(403);

    const listed = await listProducts(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(listed.status).toBe(200);

    const detail = await getProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products/${product.id}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId, productId: product.id }) }
    );
    expect(detail.status).toBe(200);

    // UTA-81: adjustments are Manager/Admin writes — Staff is denied.
    const staffAdjust = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 10, reason: 'initial stock' },
        bearer(staffToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(staffAdjust.status).toBe(403);

    const adjusted = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 10, reason: 'initial stock' },
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(adjusted.status).toBe(201);
    const adjustedBody = (await adjusted.json()) as {
      level: { qty: number };
      entry: { balanceAfter: number };
    };
    expect(adjustedBody.level.qty).toBe(10);
    expect(adjustedBody.entry.balanceAfter).toBe(10);

    // Staff can still read the ledger and balances.
    const ledger = await getLedger(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/ledger`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(ledger.status).toBe(200);
    const balance = await getStockBalance(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/stock`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(balance.status).toBe(200);
  });

  it('denies cross-workspace access indistinguishably', async () => {
    const { product } = await seedProduct(adminToken);
    const foreign = 'ws_foreign_0001';
    const res = await getProduct(
      apiRequest(
        `/api/workspaces/${foreign}/catalog/products/${product.id}`,
        undefined,
        bearer(adminToken),
        'GET'
      ),
      {
        params: Promise.resolve({
          workspaceId: foreign,
          productId: product.id,
        }),
      }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Cross-workspace access denied',
      errorCode: 'TENANCY_FORBIDDEN',
    });
  });

  it('requires warehouse + reason for adjustments and guards balances', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const ctx = { params: Promise.resolve({ workspaceId, variantId }) };

    const noReason = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 5, reason: '  ' },
        bearer(managerToken)
      ),
      ctx
    );
    expect(noReason.status).toBe(400);

    const overdraw = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: -1, reason: 'oversell' },
        bearer(managerToken)
      ),
      ctx
    );
    expect(overdraw.status).toBe(422);
    expect((await overdraw.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_INSUFFICIENT_STOCK',
    });

    await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 7, reason: 'initial stock' },
        bearer(managerToken)
      ),
      ctx
    );
    const ledger = await getLedger(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/ledger`,
        undefined,
        bearer(managerToken),
        'GET'
      ),
      ctx
    );
    expect(ledger.status).toBe(200);
    const entries = (
      (await ledger.json()) as {
        entries: Array<{ delta: number; reason: string }>;
      }
    ).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 7, reason: 'initial stock' });
  });

  it('locks SKU codes after movements; admins only before that', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const ctx = { params: Promise.resolve({ workspaceId, variantId }) };

    const managerRename = await updateVariant(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}`,
        { skuCode: 'MGR-RENAME', expectedVersion: 1 },
        bearer(managerToken),
        'PATCH'
      ),
      ctx
    );
    expect(managerRename.status).toBe(403);

    const renamed = await updateVariant(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}`,
        { skuCode: 'KAOS-MERAH-M2', expectedVersion: 1 },
        bearer(adminToken),
        'PATCH'
      ),
      ctx
    );
    expect(renamed.status).toBe(200);

    await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 4, reason: 'initial stock' },
        bearer(adminToken)
      ),
      ctx
    );
    const locked = await updateVariant(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}`,
        { skuCode: 'KAOS-MERAH-M3', expectedVersion: 2 },
        bearer(adminToken),
        'PATCH'
      ),
      ctx
    );
    expect(locked.status).toBe(422);
    expect((await locked.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_SKU_LOCKED',
    });
  });

  it('rejects stale versions and deactivated warehouses', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';

    const stale = await updateProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products/${product.id}`,
        { name: 'stale', expectedVersion: 99 },
        bearer(adminToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, productId: product.id }) }
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_VERSION_CONFLICT',
    });

    const deactivated = await updateWarehouse(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/warehouses/${warehouse.id}`,
        { status: 'deactivated', expectedVersion: warehouse.version },
        bearer(adminToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, warehouseId: warehouse.id }) }
    );
    expect(deactivated.status).toBe(200);

    const blocked = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 3, reason: 'late delivery' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
    expect(blocked.status).toBe(422);
    expect((await blocked.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_WAREHOUSE_INACTIVE',
    });
  });

  it('archives with stock on hand and never hard-deletes', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';

    await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: 2, reason: 'initial stock' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );

    const archived = await archiveProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products/${product.id}/archive`,
        {},
        bearer(managerToken)
      ),
      { params: Promise.resolve({ workspaceId, productId: product.id }) }
    );
    expect(archived.status).toBe(200);
    const archivedBody = (await archived.json()) as {
      product: { status: string; variants: Array<{ status: string }> };
    };
    expect(archivedBody.product.status).toBe('archived');
    expect(archivedBody.product.variants[0]?.status).toBe('archived');

    const noDelete = await deleteProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products/${product.id}`,
        undefined,
        bearer(adminToken),
        'DELETE'
      ),
      { params: Promise.resolve({ workspaceId, productId: product.id }) }
    );
    expect(noDelete.status).toBe(405);
    expect((await noDelete.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_NO_HARD_DELETE',
    });
  });

  it('maps channel listings and searches every identifier', async () => {
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const ctx = { params: Promise.resolve({ workspaceId, variantId }) };

    const mapped = await createMapping(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/mappings`,
        {
          channel: 'shopee',
          shopExtId: 'shop_42',
          platformSkuId: 'SHOPEE-9001',
          sellerSkuHint: 'SELLER-KAOS-M',
        },
        bearer(managerToken)
      ),
      ctx
    );
    expect(mapped.status).toBe(201);

    const dupeMapping = await createMapping(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/mappings`,
        {
          channel: 'shopee',
          shopExtId: 'shop_42',
          platformSkuId: 'SHOPEE-9001',
        },
        bearer(managerToken)
      ),
      ctx
    );
    expect(dupeMapping.status).toBe(409);

    const listed = await listMappings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/mappings`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      ctx
    );
    expect(listed.status).toBe(200);

    for (const q of [
      'kaos polos',
      'kaos-merah-m',
      '8991234500001',
      'seller-kaos',
      'shopee-9001',
      'merah m',
    ]) {
      const res = await searchCatalog(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/search?q=${encodeURIComponent(q)}`,
          undefined,
          bearer(staffToken),
          'GET'
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        variants: Array<{ skuCode: string }>;
      };
      expect(body.variants.map((v) => v.skuCode)).toContain('KAOS-MERAH-M');
    }

    const variant = await getVariant(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      ctx
    );
    expect(variant.status).toBe(200);
    const variantBody = (await variant.json()) as {
      variant: { mappings: Array<{ platformSkuId: string }> };
    };
    expect(variantBody.variant.mappings.map((m) => m.platformSkuId)).toContain(
      'SHOPEE-9001'
    );

    const warehouses = await listWarehouses(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/warehouses`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(warehouses.status).toBe(200);
  });

  it('dedupes retried adjustments by idempotency key (UTA-81)', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const ctx = { params: Promise.resolve({ workspaceId, variantId }) };
    const payload = {
      warehouseId: warehouse.id,
      delta: 9,
      reason: 'initial stock',
      idempotencyKey: 'route-retry-1',
    };

    const first = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        payload,
        bearer(managerToken)
      ),
      ctx
    );
    expect(first.status).toBe(201);

    const retry = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        payload,
        bearer(managerToken)
      ),
      ctx
    );
    expect(retry.status).toBe(200);
    const retryBody = (await retry.json()) as {
      deduplicated: boolean;
      entry: { id: string };
      level: { qty: number };
    };
    expect(retryBody.deduplicated).toBe(true);
    expect(retryBody.level.qty).toBe(9);
    const firstBody = (await first.json()) as { entry: { id: string } };
    expect(retryBody.entry.id).toBe(firstBody.entry.id);

    // Same key, different payload → 409 (no silent merge).
    const clash = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { ...payload, delta: 10 },
        bearer(managerToken)
      ),
      ctx
    );
    expect(clash.status).toBe(409);
  });

  it('gates negative stock behind the Admin-only toggle (UTA-81)', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const adjCtx = { params: Promise.resolve({ workspaceId, variantId }) };
    const settingsCtx = { params: Promise.resolve({ workspaceId }) };

    // Default OFF — staff and managers can read it.
    const current = await getStockSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/stock-settings`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      settingsCtx
    );
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as {
      settings: { allowNegative: boolean; version: number };
    };
    expect(currentBody.settings.allowNegative).toBe(false);

    const overdraw = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: -1, reason: 'oversell' },
        bearer(managerToken)
      ),
      adjCtx
    );
    expect(overdraw.status).toBe(422);
    expect((await overdraw.json()) as { errorCode: string }).toMatchObject({
      errorCode: 'CATALOG_INSUFFICIENT_STOCK',
    });

    // Manager toggle attempt → 403.
    const managerToggle = await updateStockSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/stock-settings`,
        {
          allowNegative: true,
          expectedVersion: currentBody.settings.version,
        },
        bearer(managerToken),
        'PUT'
      ),
      settingsCtx
    );
    expect(managerToggle.status).toBe(403);

    // Admin enables it; stale versions reject.
    const enabled = await updateStockSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/stock-settings`,
        {
          allowNegative: true,
          expectedVersion: currentBody.settings.version,
        },
        bearer(adminToken),
        'PUT'
      ),
      settingsCtx
    );
    expect(enabled.status).toBe(200);
    const stale = await updateStockSettings(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/stock-settings`,
        {
          allowNegative: false,
          expectedVersion: currentBody.settings.version,
        },
        bearer(adminToken),
        'PUT'
      ),
      settingsCtx
    );
    expect(stale.status).toBe(409);

    const allowed = await adjustStock(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
        { warehouseId: warehouse.id, delta: -4, reason: 'oversell allowed' },
        bearer(managerToken)
      ),
      adjCtx
    );
    expect(allowed.status).toBe(201);
    expect((await allowed.json()) as { level: { qty: number } }).toMatchObject({
      level: { qty: -4 },
    });
  });

  it('reads consolidated + per-warehouse balances and filters the ledger (UTA-81)', async () => {
    const { warehouse } = await seedWarehouse(adminToken);
    const other = await seedWarehouse(managerToken, 'SBY-01');
    const { product } = await seedProduct(adminToken);
    const variantId = product.variants[0]?.id ?? '';
    const ctx = { params: Promise.resolve({ workspaceId, variantId }) };

    for (const [id, delta, reason] of [
      [warehouse.id, 10, 'jkt stock'],
      [other.warehouse.id, 4, 'sby stock'],
    ] as const) {
      const res = await adjustStock(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
          { warehouseId: id, delta, reason },
          bearer(managerToken)
        ),
        ctx
      );
      expect(res.status).toBe(201);
    }

    const balance = await getStockBalance(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/stock`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      ctx
    );
    expect(balance.status).toBe(200);
    const balanceBody = (await balance.json()) as {
      balance: {
        totalQty: number;
        perWarehouse: Array<{ warehouseId: string; qty: number }>;
      };
    };
    expect(balanceBody.balance.totalQty).toBe(14);
    expect(
      new Map(
        balanceBody.balance.perWarehouse.map((p) => [p.warehouseId, p.qty])
      ).get(other.warehouse.id)
    ).toBe(4);

    const filtered = await getLedger(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/ledger?warehouseId=${other.warehouse.id}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      ctx
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      entries: Array<{ reason: string }>;
    };
    expect(filteredBody.entries).toHaveLength(1);
    expect(filteredBody.entries[0]?.reason).toBe('sby stock');
  });

  describe('transfers (UTA-124)', () => {
    it('Manager can create a draft and list includes it; Staff denied; invalid body rejected', async () => {
      // Seed two warehouses for source & dest
      const src = await seedWarehouse(managerToken, 'JKT-01');
      const dst = await seedWarehouse(managerToken, 'SBY-01');

      // 1. Manager POST create draft → 201
      const created = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-001',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
            notes: 'initial stock move',
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        transfer: {
          id: string;
          status: string;
          sourceWarehouseId: string;
          destWarehouseId: string;
        };
      };
      expect(createdBody.transfer.status).toBe('draft');
      expect(createdBody.transfer.sourceWarehouseId).toBe(src.warehouse.id);
      expect(createdBody.transfer.destWarehouseId).toBe(dst.warehouse.id);
      const transferId = createdBody.transfer.id;

      // 2. GET list → 200, includes the transfer
      const listed = await listTransfers(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          undefined,
          bearer(managerToken),
          'GET'
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(listed.status).toBe(200);
      const listedBody = (await listed.json()) as {
        transfers: Array<{ id: string }>;
      };
      expect(listedBody.transfers.map((t) => t.id)).toContain(transferId);

      // 3. Staff POST create → 403 TENANCY_FORBIDDEN
      const staffDenied = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-BLOCKED',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(staffToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(staffDenied.status).toBe(403);
      const deniedBody = (await staffDenied.json()) as { errorCode: string };
      expect(deniedBody.errorCode).toBe('TENANCY_FORBIDDEN');

      // 4. POST invalid body (empty referenceNum) → 400 CATALOG_VALIDATION
      const invalid = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: '',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { errorCode: string };
      expect(invalidBody.errorCode).toBe('CATALOG_VALIDATION');
    });
  });

  describe('transfers get-by-id + add-items (UTA-125)', () => {
    it('Manager creates draft, adds items (201), GET by id (200); Staff add-items (403); invalid body (400); unknown id (404)', async () => {
      // Seed two warehouses for source & dest
      const src = await seedWarehouse(managerToken, 'JKT-01');
      const dst = await seedWarehouse(managerToken, 'SBY-01');

      // Seed a product+variant to reference in items
      const { product } = await seedProduct(managerToken);
      const variantId = product.variants[0]?.id ?? '';

      // 1. Manager POST create draft → 201
      const created = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-002',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
            notes: 'stock move',
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        transfer: { id: string; status: string };
      };
      const transferId = createdBody.transfer.id;

      // 2. Manager POST add-items → 201, items include variantId + requestedQty
      const added = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 5,
              },
            ],
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(added.status).toBe(201);
      const addedBody = (await added.json()) as {
        items: Array<{ variantId: string; requestedQty: number }>;
      };
      expect(addedBody.items).toHaveLength(1);
      expect(addedBody.items[0]?.variantId).toBe(variantId);
      expect(addedBody.items[0]?.requestedQty).toBe(5);

      // 3. Manager GET by id → 200, body has matching id/status and added items
      const got = await getTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}`,
          undefined,
          bearer(managerToken),
          'GET'
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(got.status).toBe(200);
      const gotBody = (await got.json()) as {
        transfer: { id: string; status: string };
        items: Array<{ variantId: string }>;
      };
      expect(gotBody.transfer.id).toBe(transferId);
      expect(gotBody.transfer.status).toBe('draft');
      expect(gotBody.items).toHaveLength(1);
      expect(gotBody.items[0]?.variantId).toBe(variantId);

      // 4. Staff POST add-items → 403 TENANCY_FORBIDDEN
      const staffAdded = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 1,
              },
            ],
          },
          bearer(staffToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(staffAdded.status).toBe(403);
      const staffDenial = (await staffAdded.json()) as { errorCode: string };
      expect(staffDenial.errorCode).toBe('TENANCY_FORBIDDEN');

      // 5. POST invalid body (empty items array) → 400 CATALOG_VALIDATION
      const invalid = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          { items: [] },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { errorCode: string };
      expect(invalidBody.errorCode).toBe('CATALOG_VALIDATION');

      // 6. GET unknown transferId → 404 with CATALOG_NOT_FOUND
      const unknown = await getTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/nonexistent`,
          undefined,
          bearer(managerToken),
          'GET'
        ),
        {
          params: Promise.resolve({
            workspaceId,
            transferId: 'nonexistent',
          }),
        }
      );
      expect(unknown.status).toBe(404);
      const unknownBody = (await unknown.json()) as { errorCode: string };
      expect(unknownBody.errorCode).toBe('CATALOG_NOT_FOUND');
    });
  });

  describe('transfers send (UTA-126)', () => {
    it('Manager sends transfer (200 sent), Staff denied (403), invalid body (400), unknown id (404)', async () => {
      // Seed source + dest warehouses
      const src = await seedWarehouse(managerToken, 'JKT-01');
      const dst = await seedWarehouse(managerToken, 'SBY-01');

      // Seed a product+variant
      const { product } = await seedProduct(managerToken);
      const variantId = product.variants[0]?.id ?? '';

      // Seed source stock +10
      const adjusted = await adjustStock(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
          { warehouseId: src.warehouse.id, delta: 10, reason: 'initial stock' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, variantId }) }
      );
      expect(adjusted.status).toBe(201);

      // Create draft transfer
      const created = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-SEND-001',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        transfer: { id: string };
      };
      const transferId = createdBody.transfer.id;

      // Add items qty 5
      const added = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 5,
              },
            ],
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(added.status).toBe(201);

      // 1. Manager POST send with empty body {} --> 200, status 'sent'
      const sent = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/send`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(sent.status).toBe(200);
      const sentBody = (await sent.json()) as {
        transfer: { id: string; status: string };
        items: Array<{ variantId: string; sentQty: number }>;
        storage: string;
      };
      expect(sentBody.transfer.id).toBe(transferId);
      expect(sentBody.transfer.status).toBe('sent');
      expect(sentBody.items).toHaveLength(1);
      expect(sentBody.items[0]?.variantId).toBe(variantId);
      expect(sentBody.items[0]?.sentQty).toBe(5);
      expect(sentBody.storage).toBe('memory');

      // 2. Create a second draft to test Staff denial on send
      const draft2 = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-SEND-002',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(draft2.status).toBe(201);
      const draft2Body = (await draft2.json()) as {
        transfer: { id: string };
      };
      const transferId2 = draft2Body.transfer.id;

      // Staff POST send --> 403 TENANCY_FORBIDDEN
      const staffSent = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/send`,
          {},
          bearer(staffToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(staffSent.status).toBe(403);
      const staffDenial = (await staffSent.json()) as { errorCode: string };
      expect(staffDenial.errorCode).toBe('TENANCY_FORBIDDEN');

      // 3. POST send with invalid body { expectedVersion: 'nope' } --> 400 CATALOG_VALIDATION
      const invalid = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/send`,
          { expectedVersion: 'nope' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { errorCode: string };
      expect(invalidBody.errorCode).toBe('CATALOG_VALIDATION');

      // 4. POST send on unknown transferId --> 404 with CATALOG_NOT_FOUND
      const unknown = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/nonexistent/send`,
          {},
          bearer(managerToken)
        ),
        {
          params: Promise.resolve({
            workspaceId,
            transferId: 'nonexistent',
          }),
        }
      );
      expect(unknown.status).toBe(404);
      const unknownBody = (await unknown.json()) as { errorCode: string };
      expect(unknownBody.errorCode).toBe('CATALOG_NOT_FOUND');
    });
  });

  describe('transfers receive (UTA-127)', () => {
    it('Manager receives transfer (200 received), Staff denied (403), invalid body (400), unknown id (404)', async () => {
      const src = await seedWarehouse(managerToken, 'JKT-RCV-01');
      const dst = await seedWarehouse(managerToken, 'SBY-RCV-01');

      const { product } = await seedProduct(managerToken);
      const variantId = product.variants[0]?.id ?? '';

      const adjusted = await adjustStock(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
          { warehouseId: src.warehouse.id, delta: 10, reason: 'initial stock' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, variantId }) }
      );
      expect(adjusted.status).toBe(201);

      const created = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-RCV-001',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        transfer: { id: string };
      };
      const transferId = createdBody.transfer.id;

      const added = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 5,
              },
            ],
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(added.status).toBe(201);

      const sent = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/send`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(sent.status).toBe(200);

      const received = await receiveTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/receive`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(received.status).toBe(200);
      const receivedBody = (await received.json()) as {
        transfer: { id: string; status: string };
        items: Array<{ variantId: string; receivedQty: number }>;
        storage: string;
      };
      expect(receivedBody.transfer.id).toBe(transferId);
      expect(receivedBody.transfer.status).toBe('received');
      expect(receivedBody.items).toHaveLength(1);
      expect(receivedBody.items[0]?.variantId).toBe(variantId);
      expect(receivedBody.items[0]?.receivedQty).toBe(5);
      expect(receivedBody.storage).toBe('memory');

      // Second sent transfer for Staff denial / validation
      const created2 = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-RCV-002',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created2.status).toBe(201);
      const created2Body = (await created2.json()) as {
        transfer: { id: string };
      };
      const transferId2 = created2Body.transfer.id;

      const added2 = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 3,
              },
            ],
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(added2.status).toBe(201);

      const sent2 = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/send`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(sent2.status).toBe(200);

      const staffRecv = await receiveTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/receive`,
          {},
          bearer(staffToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(staffRecv.status).toBe(403);
      const staffDenial = (await staffRecv.json()) as { errorCode: string };
      expect(staffDenial.errorCode).toBe('TENANCY_FORBIDDEN');

      const invalid = await receiveTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/receive`,
          { expectedVersion: 'nope' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { errorCode: string };
      expect(invalidBody.errorCode).toBe('CATALOG_VALIDATION');

      const unknown = await receiveTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/nonexistent/receive`,
          {},
          bearer(managerToken)
        ),
        {
          params: Promise.resolve({
            workspaceId,
            transferId: 'nonexistent',
          }),
        }
      );
      expect(unknown.status).toBe(404);
      const unknownBody = (await unknown.json()) as { errorCode: string };
      expect(unknownBody.errorCode).toBe('CATALOG_NOT_FOUND');
    });
  });

  describe('transfers cancel (UTA-128)', () => {
    it('Manager cancels sent transfer (200 cancelled), Staff denied (403), invalid body (400), unknown id (404)', async () => {
      const src = await seedWarehouse(managerToken, 'JKT-CAN-01');
      const dst = await seedWarehouse(managerToken, 'SBY-CAN-01');

      const { product } = await seedProduct(managerToken);
      const variantId = product.variants[0]?.id ?? '';

      const adjusted = await adjustStock(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/adjustments`,
          { warehouseId: src.warehouse.id, delta: 10, reason: 'initial stock' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, variantId }) }
      );
      expect(adjusted.status).toBe(201);

      const created = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-CAN-001',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        transfer: { id: string };
      };
      const transferId = createdBody.transfer.id;

      const added = await addTransferItems(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/items`,
          {
            items: [
              {
                variantId,
                requestedQty: 5,
              },
            ],
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(added.status).toBe(201);

      const sent = await sendTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/send`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(sent.status).toBe(200);

      const cancelled = await cancelTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId}/cancel`,
          {},
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId }) }
      );
      expect(cancelled.status).toBe(200);
      const cancelledBody = (await cancelled.json()) as {
        transfer: { id: string; status: string };
        items: Array<{ variantId: string }>;
        storage: string;
      };
      expect(cancelledBody.transfer.id).toBe(transferId);
      expect(cancelledBody.transfer.status).toBe('cancelled');
      expect(cancelledBody.items).toHaveLength(1);
      expect(cancelledBody.items[0]?.variantId).toBe(variantId);
      expect(cancelledBody.storage).toBe('memory');

      const draft2 = await createTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers`,
          {
            referenceNum: 'TRF-CAN-002',
            sourceWarehouseId: src.warehouse.id,
            destWarehouseId: dst.warehouse.id,
          },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      );
      expect(draft2.status).toBe(201);
      const draft2Body = (await draft2.json()) as {
        transfer: { id: string };
      };
      const transferId2 = draft2Body.transfer.id;

      const staffCancel = await cancelTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/cancel`,
          {},
          bearer(staffToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(staffCancel.status).toBe(403);
      const staffDenial = (await staffCancel.json()) as { errorCode: string };
      expect(staffDenial.errorCode).toBe('TENANCY_FORBIDDEN');

      const invalid = await cancelTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/${transferId2}/cancel`,
          { expectedVersion: 'nope' },
          bearer(managerToken)
        ),
        { params: Promise.resolve({ workspaceId, transferId: transferId2 }) }
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { errorCode: string };
      expect(invalidBody.errorCode).toBe('CATALOG_VALIDATION');

      const unknown = await cancelTransfer(
        apiRequest(
          `/api/workspaces/${workspaceId}/catalog/transfers/nonexistent/cancel`,
          {},
          bearer(managerToken)
        ),
        {
          params: Promise.resolve({
            workspaceId,
            transferId: 'nonexistent',
          }),
        }
      );
      expect(unknown.status).toBe(404);
      const unknownBody = (await unknown.json()) as { errorCode: string };
      expect(unknownBody.errorCode).toBe('CATALOG_NOT_FOUND');
    });
  });
});
