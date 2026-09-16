import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { __resetImportsForTests } from '../lib/imports';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import {
  GET as listImports,
  POST as uploadImport,
} from '../app/api/workspaces/[workspaceId]/imports/route';
import {
  GET as getImport,
  PATCH as patchBatch,
} from '../app/api/workspaces/[workspaceId]/imports/[batchId]/route';
import { PATCH as patchRow } from '../app/api/workspaces/[workspaceId]/imports/[batchId]/rows/[rowId]/route';
import { POST as confirmImport } from '../app/api/workspaces/[workspaceId]/imports/[batchId]/confirm/route';
import { GET as searchCatalog } from '../app/api/workspaces/[workspaceId]/catalog/search/route';

/**
 * Unstructured product import API + review/confirm pipeline (UTA-77,
 * Story 02) through the memory wiring: upload creates a reviewable batch,
 * review edits/rejects rows, confirm creates catalog records via the UTA-75
 * rules, duplicates surface the existing path, and the marketplace Store
 * SKU never replaces the SKU TokoBoss identity.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const MANAGER_EMAIL = 'manager@fixture.test';
const MANAGER_PASSWORD = 'manager-noodles-88';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';

const CSV = [
  'product_name,sku_tokoboss,variant_name,price,store_sku,channel,shop_id,platform_sku_id',
  'Kaos Polos,KAOS-MERAH-M,Merah / M,99000,SELLER-KAOS-M,shopee,shop_42,SHOPEE-9001',
  'Kaos Polos,KAOS-PUTIH-L,Putih / L,99000,,,',
].join('\n');

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

describe('product import routes (memory wiring)', () => {
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

  async function upload(
    token: string,
    body: unknown,
    ws: string = workspaceId
  ) {
    return uploadImport(
      apiRequest(`/api/workspaces/${ws}/imports`, body, bearer(token)),
      {
        params: Promise.resolve({ workspaceId: ws }),
      }
    );
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    __resetImportsForTests();
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

  it('upload creates a reviewable batch; staff writes denied', async () => {
    const res = await upload(managerToken, {
      filename: 'produk.csv',
      contentType: 'text/csv',
      content: CSV,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      batch: {
        id: string;
        status: string;
        totalRows: number;
        readyRows: number;
        rows: Array<{
          id: string;
          skuCode: string;
          status: string;
          sellerSkuHint: string | null;
        }>;
      };
      duplicate: boolean;
      jobId: string | null;
      storage: string;
    };
    expect(body.storage).toBe('memory');
    expect(body.batch.status).toBe('review');
    expect(body.batch.totalRows).toBe(2);
    expect(body.batch.rows.map((r) => r.skuCode).sort()).toEqual([
      'KAOS-MERAH-M',
      'KAOS-PUTIH-L',
    ]);
    expect(
      body.batch.rows.find((r) => r.skuCode === 'KAOS-MERAH-M')?.sellerSkuHint
    ).toBe('SELLER-KAOS-M');
    expect(body.jobId).not.toBeNull();

    const denied = await upload(staffToken, {
      filename: 'produk.csv',
      contentType: 'text/csv',
      content: CSV,
    });
    expect(denied.status).toBe(403);

    const listed = await listImports(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      batches: Array<{ id: string }>;
    };
    expect(listedBody.batches.map((b) => b.id)).toContain(body.batch.id);
  });

  it('reviews rows then confirms into the catalog with mapping candidates', async () => {
    const created = (await (
      await upload(managerToken, {
        filename: 'produk.csv',
        contentType: 'text/csv',
        content: CSV,
      })
    ).json()) as {
      batch: {
        id: string;
        rows: Array<{ id: string; skuCode: string; status: string }>;
      };
    };
    const batchId = created.batch.id;
    const ctx = { params: Promise.resolve({ workspaceId, batchId }) };

    // Reject one row in review; confirm applies the survivor.
    const putih = created.batch.rows.find((r) => r.skuCode === 'KAOS-PUTIH-L');
    const rejected = await patchRow(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}/rows/${putih?.id}`,
        { status: 'rejected', note: 'out of scope' },
        bearer(managerToken),
        'PATCH'
      ),
      {
        params: Promise.resolve({
          workspaceId,
          batchId,
          rowId: putih?.id ?? '',
        }),
      }
    );
    expect(rejected.status).toBe(200);

    const confirmed = await confirmImport(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}/confirm`,
        {},
        bearer(managerToken)
      ),
      ctx
    );
    expect(confirmed.status).toBe(200);
    const result = (await confirmed.json()) as {
      summary: {
        applied: Array<{ rowId: string; productId: string; variantId: string }>;
        duplicates: unknown[];
        skipped: Array<{ rowId: string; reason: string }>;
      };
      batch: { status: string; appliedRows: number; rejectedRows: number };
    };
    expect(result.summary.applied).toHaveLength(1);
    expect(result.summary.duplicates).toHaveLength(0);
    expect(
      result.summary.skipped.find((s) => s.rowId === putih?.id)?.reason
    ).toBe('rejected in review');
    expect(result.batch).toMatchObject({
      status: 'applied',
      appliedRows: 1,
      rejectedRows: 1,
    });

    // The catalog holds the product; the Store SKU is searchable as a hint
    // while the TokoBoss identity is unchanged.
    const search = await searchCatalog(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/search?q=${encodeURIComponent('seller-kaos')}`,
        undefined,
        bearer(staffToken),
        'GET'
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(search.status).toBe(200);
    const hits = (await search.json()) as {
      variants: Array<{ skuCode: string }>;
    };
    expect(hits.variants.map((v) => v.skuCode)).toContain('KAOS-MERAH-M');
  });

  it('duplicate SKUs surface the existing path and never overwrite', async () => {
    const first = (await (
      await upload(managerToken, {
        filename: 'a.csv',
        contentType: 'text/csv',
        content: CSV,
      })
    ).json()) as { batch: { id: string } };
    const confirmCtx = (batchId: string) => ({
      params: Promise.resolve({ workspaceId, batchId }),
    });
    const ok = await confirmImport(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${first.batch.id}/confirm`,
        {},
        bearer(managerToken)
      ),
      confirmCtx(first.batch.id)
    );
    expect(ok.status).toBe(200);

    const second = (await (
      await upload(managerToken, {
        filename: 'b.csv',
        contentType: 'text/csv',
        content: CSV,
      })
    ).json()) as { batch: { id: string } };
    const dupe = await confirmImport(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${second.batch.id}/confirm`,
        {},
        bearer(managerToken)
      ),
      confirmCtx(second.batch.id)
    );
    expect(dupe.status).toBe(200);
    const body = (await dupe.json()) as {
      summary: {
        applied: unknown[];
        duplicates: Array<{
          skuCode: string;
          existingPath: string;
          existingVariantId: string;
        }>;
      };
    };
    expect(body.summary.applied).toHaveLength(0);
    expect(body.summary.duplicates).toHaveLength(2);
    expect(body.summary.duplicates[0]?.existingPath).toContain(
      `/api/workspaces/${workspaceId}/catalog/products/`
    );
    expect(
      body.summary.duplicates[0]?.existingVariantId.length
    ).toBeGreaterThan(0);
  });

  it('denies cross-workspace access indistinguishably', async () => {
    const created = (await (
      await upload(managerToken, {
        filename: 'produk.csv',
        contentType: 'text/csv',
        content: CSV,
      })
    ).json()) as { batch: { id: string } };
    const foreign = 'ws_foreign_0001';
    const res = await getImport(
      apiRequest(
        `/api/workspaces/${foreign}/imports/${created.batch.id}`,
        undefined,
        bearer(managerToken),
        'GET'
      ),
      {
        params: Promise.resolve({
          workspaceId: foreign,
          batchId: created.batch.id,
        }),
      }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Cross-workspace access denied',
      errorCode: 'TENANCY_FORBIDDEN',
    });
  });

  it('rejects and reopens batches; validates row edits', async () => {
    const created = (await (
      await upload(managerToken, {
        filename: 'produk.csv',
        contentType: 'text/csv',
        content: 'product_name,price\n,1000\n',
      })
    ).json()) as {
      batch: {
        id: string;
        status: string;
        rows: Array<{ id: string; status: string }>;
      };
    };
    expect(created.batch.status).toBe('draft');
    const batchId = created.batch.id;
    const rowId = created.batch.rows[0]?.id ?? '';

    const badEdit = await patchRow(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}/rows/${rowId}`,
        { sellingPriceCents: -5 },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, batchId, rowId }) }
    );
    expect(badEdit.status).toBe(400);

    const fixed = await patchRow(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}/rows/${rowId}`,
        { productName: 'Kaos Fixed' },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, batchId, rowId }) }
    );
    expect(fixed.status).toBe(200);
    expect(
      ((await fixed.json()) as { row: { status: string } }).row.status
    ).toBe('review');

    const rejected = await patchBatch(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}`,
        { action: 'reject' },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, batchId }) }
    );
    expect(rejected.status).toBe(200);
    expect(
      ((await rejected.json()) as { batch: { status: string } }).batch.status
    ).toBe('rejected');

    const reopened = await patchBatch(
      apiRequest(
        `/api/workspaces/${workspaceId}/imports/${batchId}`,
        { action: 'reopen' },
        bearer(managerToken),
        'PATCH'
      ),
      { params: Promise.resolve({ workspaceId, batchId }) }
    );
    expect(reopened.status).toBe(200);
    expect(
      ((await reopened.json()) as { batch: { status: string } }).batch.status
    ).toBe('review');
  });
});
