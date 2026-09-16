import { describe, expect, it, vi } from 'vitest';
import {
  CatalogClientError,
  adjustStock,
  createProduct,
  formatIdr,
  getLedger,
  getProductDetail,
  listProducts,
  listWarehouses,
  primarySku,
  productTotalQty,
  searchCatalog,
  toCatalogClientError,
  totalQty,
  updateVariant,
} from '../lib/catalog-client';
import { catalogCopyKeys, getCatalogCopy } from '../lib/catalog-copy';

/**
 * Web Produk & Stok UI client (UTA-76): happy paths over the UTA-75 APIs,
 * duplicate-SKU path surfacing, adjustment/ledger wiring, re-auth mapping,
 * version/lock mapping, and no-secret error shapes.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit?]> };
  };
}

const WS = 'ws_fixture_01';

function productFixture() {
  return {
    id: 'prod_1',
    workspaceId: WS,
    name: 'Kaos Polos',
    description: null,
    unit: 'pcs',
    pictures: [],
    status: 'active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants: [
      {
        id: 'var_1',
        workspaceId: WS,
        productId: 'prod_1',
        skuCode: 'KAOS-MERAH-M',
        name: 'Merah / M',
        barcode: '8991234500001',
        sellingPriceCents: 99000,
        currency: 'IDR',
        hppCents: 45000,
        costSource: 'manual',
        listingName: 'Kaos Polos Merah M',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        levels: [
          {
            variantId: 'var_1',
            warehouseId: 'wh_1',
            qty: 10,
            version: 2,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  };
}

describe('catalog-client (UTA-76 UI)', () => {
  it('lists and searches over cookies with no tokens in play', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      if (String(url).startsWith(`/api/workspaces/${WS}/catalog/search`)) {
        return jsonResponse(
          { products: [productFixture()], variants: [] },
          200
        );
      }
      return jsonResponse({ products: [productFixture()] }, 200);
    });

    const listed = await listProducts(WS, undefined, { fetchFn });
    expect(listed).toHaveLength(1);
    expect(primarySku(listed[0]!)).toBe('KAOS-MERAH-M');
    expect(productTotalQty(listed[0]!)).toBe(10);
    expect(totalQty(listed[0]!.variants![0]!)).toBe(10);

    const found = await searchCatalog(WS, 'kaos-merah', { fetchFn });
    expect(found.products).toHaveLength(1);
    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(JSON.stringify(seen)).not.toMatch(/Bearer|tb_session/);
  });

  it('creates products with at least one variant (unit defaults to pcs)', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/products`);
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body.name).toBe('Kaos Polos');
      expect(body.unit).toBe('pcs');
      expect(body.variants).toHaveLength(1);
      expect(body.variants[0].skuCode).toBe('KAOS-MERAH-M');
      return jsonResponse({ product: productFixture() }, 201);
    });
    const created = await createProduct(
      WS,
      {
        name: 'Kaos Polos',
        variants: [{ skuCode: 'KAOS-MERAH-M', sellingPriceCents: 99000 }],
      },
      { fetchFn }
    );
    expect(created.variants?.[0]?.skuCode).toBe('KAOS-MERAH-M');
  });

  it('surfaces duplicate SKUs with the existing path and nothing else', async () => {
    const existingPath = `/api/workspaces/${WS}/catalog/products/prod_1`;
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Duplicate.',
          errorCode: 'CATALOG_CONFLICT',
          details: {
            existingPath,
            existingVariantId: 'var_1',
          },
        },
        409
      )
    );
    const err = await createProduct(
      WS,
      {
        name: 'Dupe',
        variants: [{ skuCode: 'KAOS-MERAH-M', sellingPriceCents: 1 }],
      },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogClientError);
    const clientErr = err as CatalogClientError;
    expect(clientErr.errorCode).toBe('CATALOG_CONFLICT');
    expect(clientErr.message).toBe(getCatalogCopy('en').duplicateError);
    expect(clientErr.existingPath).toBe(existingPath);
    expect(clientErr.message).not.toContain('KAOS-MERAH-M');
  });

  it('adjusts stock with warehouse + delta + reason, then reads the ledger', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/adjustments')) {
        const body = JSON.parse(String(init?.body));
        expect(body.warehouseId).toBe('wh_1');
        expect(body.delta).toBe(7);
        expect(body.reason).toBe('initial stock');
        return jsonResponse(
          {
            level: {
              variantId: 'var_1',
              warehouseId: 'wh_1',
              qty: 7,
              version: 2,
              updatedAt: new Date().toISOString(),
            },
            entry: {
              id: 'led_1',
              workspaceId: WS,
              variantId: 'var_1',
              warehouseId: 'wh_1',
              delta: 7,
              balanceAfter: 7,
              reason: 'initial stock',
              actorId: null,
              correlationId: null,
              createdAt: new Date().toISOString(),
            },
          },
          201
        );
      }
      if (String(url).endsWith('/ledger')) {
        return jsonResponse(
          {
            entries: [
              {
                id: 'led_1',
                workspaceId: WS,
                variantId: 'var_1',
                warehouseId: 'wh_1',
                delta: 7,
                balanceAfter: 7,
                reason: 'initial stock',
                actorId: null,
                correlationId: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
          200
        );
      }
      return jsonResponse({}, 404);
    });
    const { level, entry } = await adjustStock(
      WS,
      'var_1',
      { warehouseId: 'wh_1', delta: 7, reason: 'initial stock' },
      { fetchFn }
    );
    expect(level.qty).toBe(7);
    expect(entry.balanceAfter).toBe(7);
    const entries = await getLedger(WS, 'var_1', { fetchFn });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 7, reason: 'initial stock' });
  });

  it('reads product detail, variant, and warehouses for the drawer', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      if (String(url).endsWith('/warehouses')) {
        return jsonResponse(
          {
            warehouses: [
              {
                id: 'wh_1',
                workspaceId: WS,
                code: 'JKT-01',
                name: 'Gudang JKT-01',
                status: 'active',
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          200
        );
      }
      if (String(url).includes('/variants/var_1')) {
        return jsonResponse({ variant: productFixture().variants![0] }, 200);
      }
      return jsonResponse({ product: productFixture() }, 200);
    });
    const detail = await getProductDetail(WS, 'prod_1', { fetchFn });
    expect(detail.variants?.[0]?.skuCode).toBe('KAOS-MERAH-M');
    const warehouses = await listWarehouses(WS, { fetchFn });
    expect(warehouses.map((w) => w.code)).toContain('JKT-01');
  });

  it('sends expectedVersion on variant saves (optimistic concurrency)', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/variants/var_1`);
      const body = JSON.parse(String(init?.body));
      expect(body.expectedVersion).toBe(1);
      expect(body.sellingPriceCents).toBe(99000);
      return jsonResponse({ variant: productFixture().variants![0] }, 200);
    });
    await updateVariant(
      WS,
      'var_1',
      { sellingPriceCents: 99000, expectedVersion: 1 },
      { fetchFn }
    );
  });

  it('maps invalid sessions to re-auth and denials without echoing ids', async () => {
    const expired = toCatalogClientError(
      401,
      { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
      'en'
    );
    expect(expired.needsReauth).toBe(true);
    expect(expired.message).toBe(getCatalogCopy('en').expiredNotice);

    const forbidden = toCatalogClientError(
      403,
      { errorCode: 'TENANCY_FORBIDDEN' },
      'en'
    );
    expect(forbidden.message).toBe(getCatalogCopy('en').forbiddenError);
    expect(forbidden.message).not.toContain(WS);

    const stale = toCatalogClientError(
      409,
      { errorCode: 'CATALOG_VERSION_CONFLICT' },
      'en'
    );
    expect(stale.message).toBe(getCatalogCopy('en').versionConflictError);

    const locked = toCatalogClientError(
      422,
      { errorCode: 'CATALOG_SKU_LOCKED' },
      'en'
    );
    expect(locked.message).toBe(getCatalogCopy('en').lockError);
  });

  it('thrown errors never echo SKUs, barcodes, reasons, or ids', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
        400
      )
    );
    const err = await createProduct(
      WS,
      {
        name: 'Kaos Polos',
        variants: [{ skuCode: 'KAOS-MERAH-M', sellingPriceCents: 99000 }],
      },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogClientError);
    const message = (err as CatalogClientError).message;
    expect(message).toBe(getCatalogCopy('en').validationError);
    expect(message).not.toContain('KAOS-MERAH-M');
    expect(JSON.stringify(err)).not.toMatch(/89912345|initial stock|Bearer/);
  });

  it('formats IDR from integer cents without floats', async () => {
    expect(formatIdr(99000)).toContain('99');
    expect(formatIdr(null)).toBe('—');
    expect(formatIdr(undefined)).toBe('—');
  });

  it('en/id copy stays in sync with no secret wording', () => {
    const en = getCatalogCopy('en');
    const id = getCatalogCopy('id');
    expect(Object.keys(id).sort()).toEqual(catalogCopyKeys().sort());
    for (const key of catalogCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer|tb_session/);
      }
    }
  });
});
