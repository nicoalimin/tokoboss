import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryIntegrationStore } from '@tokoboss/application';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { getIntegrationStore } from '../lib/integrations';
import { admitIntegrationMember } from '../lib/integration-access';
import { runConnectionInitialImport } from '../lib/integration-jobs';
import { getJobStore } from '../lib/jobs';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as connect } from '../app/api/workspaces/[workspaceId]/integrations/route';

/**
 * US20 / RFC 04 task 145a: Blibli first connect (task 141) and Lanjutkan
 * impor (task 143, `runConnectionInitialImport` behind POST /import) run
 * `executeInitialImportJob` inline (no crons) through the memory wiring
 * and a stubbed Blibli fetch: pickup points become locations, products
 * become listings with match suggestions, orders become previews, and the
 * connection ends with `initialImportStatus: 'complete'`. The integration
 * store is not reset between tests (the job store is process-local), so
 * each test uses its own merchant code.
 */

const ADMIN = { email: 'owner@fixture.test', password: 'sari-roti-88!' };
const KEYS = {
  apiSellerKey: 'seller-key-145a-secret',
  signatureKey: 'signature-key-145a-secret',
};
const PRODUCTS = [
  { gdnSku: 'BLI-145-00001-00001', merchantSku: 'KAOS-145-M', buyable: true },
  { gdnSku: 'BLI-145-00001-00002', merchantSku: 'NO-MATCH-145' },
];
const ORDER = { orderStatus: 'FP', orderDate: 1761200000000 };
const ORDERS = [
  { ...ORDER, orderNo: 'ORD-1', totalPrice: 50000 },
  { ...ORDER, orderNo: 'ORD-1', totalPrice: 25000 },
  { ...ORDER, orderNo: 'ORD-2', totalPrice: 10000 },
];

/** When true, the next pickup-point (locations) read is a Blibli 503. */
let failPickupOnce = false;
const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
  const url = String(args[0]);
  if (url.includes('getPickupPoint')) {
    if (failPickupOnce) {
      failPickupOnce = false;
      return Response.json({ success: false }, { status: 503 });
    }
    const content = [{ code: 'PP-145', name: 'Gudang Blibli' }];
    return Response.json({ success: true, content });
  }
  if (url.includes('orderList')) {
    return Response.json({ success: true, content: ORDERS });
  }
  return Response.json({ success: true, content: PRODUCTS });
});

function apiRequest(path: string, body?: unknown, token?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function store() {
  return getIntegrationStore() as unknown as InMemoryIntegrationStore;
}

describe('Blibli initial import execution (task 145a)', () => {
  let workspaceId: string;
  let token: string;
  let variantId: string;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('MARKETPLACE_PROVIDERS_ENABLED', 'blibli');
    vi.stubEnv('BLIBLI_ENV', 'uat');
    vi.stubEnv('BLIBLI_CLIENT_ID', 'blibli-client-145a');
    vi.stubEnv('BLIBLI_CLIENT_KEY', 'blibli-client-key-145a');
    vi.stubEnv('BLIBLI_CHANNEL_ID', 'tokoboss');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    failPickupOnce = false;
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    ({ workspaceId } = await seedFixtureCredential(ADMIN));
    const auth = { ...ADMIN, workspaceId, platform: 'mobile' };
    const signedIn = await signIn(apiRequest('/api/auth/sign-in', auth));
    token = ((await signedIn.json()) as { token: string }).token;
    const variant = {
      skuCode: 'KAOS-145-M',
      name: 'Merah / M',
      sellingPriceCents: 99000,
      hppCents: 45000,
      costSource: 'manual',
    };
    const product = { name: 'Kaos Polos', unit: 'pcs', variants: [variant] };
    const path = `/api/workspaces/${workspaceId}/catalog/products`;
    const created = await createProduct(apiRequest(path, product, token), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      product: { variants: { id: string }[] };
    };
    variantId = body.product.variants[0]?.id ?? '';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function firstConnect(merchantCode: string): Promise<string> {
    const path = `/api/workspaces/${workspaceId}/integrations`;
    const body = { provider: 'blibli', merchantCode, ...KEYS };
    const res = await connect(apiRequest(path, body, token), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { connection: { id: string } }).connection.id;
  }

  async function expectImportComplete(connectionId: string) {
    const ref = { workspaceId, connectionId };
    const row = await store().connections.find(workspaceId, connectionId);
    expect(row?.initialImportStatus).toBe('complete');
    const job = await getJobStore().findById(
      row?.importJobId ?? '',
      workspaceId
    );
    expect(job?.status).toBe('completed');
    const locations = [...store().listings.locations.values()];
    expect(locations).toContainEqual(
      expect.objectContaining({ ...ref, externalLocationId: 'PP-145' })
    );
    const listings = await store().listings.list(ref);
    expect(listings.map((l) => [l.platformSkuId, l.mappingState])).toEqual([
      ['BLI-145-00001-00001', 'suggested'],
      ['BLI-145-00001-00002', 'unmapped'],
    ]);
    expect(listings[0]?.suggestedVariantIds).toEqual([variantId]);
    const previews = store().orderPreviews.previews.get(
      `${workspaceId}:${connectionId}`
    );
    expect(previews?.map((p) => [p.externalOrderId, p.lineCount])).toEqual([
      ['ORD-1', 2],
      ['ORD-2', 1],
    ]);
    expect(previews?.[0]?.totalCents).toBe(7_500_000);
  }

  it('first connect runs the initial import inline to complete', async () => {
    const connectionId = await firstConnect('BLI-145A');
    await expectImportComplete(connectionId);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.includes('getPickupPoint'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('orderList'))).toHaveLength(1);
  });

  it('a failed first run stays retryable and Lanjutkan impor completes it', async () => {
    failPickupOnce = true;
    const connectionId = await firstConnect('BLI-145B');
    const failed = await store().connections.find(workspaceId, connectionId);
    expect(failed?.initialImportStatus).toBe('queued');
    expect(await store().listings.list({ workspaceId, connectionId })).toEqual(
      []
    );
    const request = apiRequest('/retry', undefined, token);
    const admitted = await admitIntegrationMember(
      request,
      workspaceId,
      'write'
    );
    if (!admitted.ok) throw new Error('admin was not admitted');
    const run = await runConnectionInitialImport(admitted.ctx, {
      workspaceId,
      connectionId,
    });
    expect(run).toMatchObject({ jobId: failed?.importJobId, executed: true });
    await expectImportComplete(connectionId);
  });
});
