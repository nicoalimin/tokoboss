import { describe, expect, it, vi } from 'vitest';
import {
  ImportsClientError,
  confirmImport,
  formatIdr,
  getImport,
  listImports,
  parseRowsJson,
  patchImportBatch,
  patchImportRow,
  toImportsClientError,
  uploadImportCsv,
  uploadImportRows,
} from '../lib/imports-client';
import { getImportsCopy, importsCopyKeys } from '../lib/imports-copy';

/**
 * Product import review UI client (UTA-78): happy paths over the UTA-77
 * APIs, duplicate `existingPath` surfacing, review/confirm wiring,
 * re-auth mapping, rows-JSON parsing, and no-secret error shapes.
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

function batchFixture() {
  const now = new Date().toISOString();
  return {
    id: 'imp_1',
    workspaceId: WS,
    jobId: 'job_1',
    sourceFilename: 'produk.csv',
    sourceMime: 'text/csv',
    sourceByteSize: 128,
    status: 'review',
    totalRows: 2,
    readyRows: 1,
    appliedRows: 0,
    rejectedRows: 0,
    createdAt: now,
    updatedAt: now,
    rows: [
      {
        id: 'row_1',
        workspaceId: WS,
        batchId: 'imp_1',
        rowNumber: 1,
        status: 'review',
        productName: 'Kaos Polos',
        skuCode: 'KAOS-MERAH-M',
        variantName: 'Merah / M',
        barcode: null,
        sellingPriceCents: 99000,
        currency: 'IDR',
        hppCents: null,
        costSource: null,
        listingName: null,
        unit: 'pcs',
        channel: 'shopee',
        shopExtId: 'shop_42',
        platformSkuId: 'SHOPEE-9001',
        sellerSkuHint: 'SELLER-KAOS-M',
        errors: [],
        duplicateOf: null,
        applied: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'row_2',
        workspaceId: WS,
        batchId: 'imp_1',
        rowNumber: 2,
        status: 'draft',
        productName: '',
        skuCode: 'IMP-2-kaos',
        variantName: null,
        barcode: null,
        sellingPriceCents: 0,
        currency: 'IDR',
        hppCents: null,
        costSource: null,
        listingName: null,
        unit: 'pcs',
        channel: null,
        shopExtId: null,
        platformSkuId: null,
        sellerSkuHint: null,
        errors: ['product_name is required'],
        duplicateOf: null,
        applied: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

describe('imports-client (UTA-78 UI)', () => {
  it('uploads CSV and rows over cookies with no tokens in play', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.rows) {
        expect(body.filename).toBe('converted.json');
        expect(body.rows).toHaveLength(1);
        return jsonResponse(
          { batch: batchFixture(), duplicate: false, jobId: 'job_1' },
          201
        );
      }
      expect(body.filename).toBe('produk.csv');
      expect(body.content).toContain('product_name');
      return jsonResponse(
        { batch: batchFixture(), duplicate: false, jobId: 'job_1' },
        201
      );
    });

    const csv = await uploadImportCsv(
      WS,
      { filename: 'produk.csv', content: 'product_name,price\nKaos,99000\n' },
      { fetchFn }
    );
    expect(csv.batch.status).toBe('review');
    expect(csv.batch.rows?.map((r) => r.skuCode)).toContain('KAOS-MERAH-M');
    // Store SKU stays a hint — never the TokoBoss identity.
    expect(csv.batch.rows?.[0]?.sellerSkuHint).toBe('SELLER-KAOS-M');
    expect(csv.batch.rows?.[0]?.skuCode).toBe('KAOS-MERAH-M');

    const rows = await uploadImportRows(
      WS,
      {
        filename: 'converted.json',
        rows: [{ product_name: 'Kaos Polos', price: 99000 }],
      },
      { fetchFn }
    );
    expect(rows.batch.totalRows).toBe(2);
    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(JSON.stringify(seen)).not.toMatch(/Bearer|tb_session/);
  });

  it('lists batches and opens batch detail for review', async () => {
    const fetchFn = stubFetch(async (url: string) => {
      if (String(url).endsWith('/imports?limit=50')) {
        return jsonResponse({ batches: [batchFixture()] }, 200);
      }
      expect(url).toBe(`/api/workspaces/${WS}/imports/imp_1`);
      return jsonResponse({ batch: batchFixture() }, 200);
    });
    const batches = await listImports(WS, { fetchFn });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.readyRows).toBe(1);
    const detail = await getImport(WS, 'imp_1', { fetchFn });
    expect(detail.rows).toHaveLength(2);
    expect(detail.rows?.[1]?.errors).toContain('product_name is required');
  });

  it('edits and rejects rows, then rejects/reopens the batch', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (String(url).includes('/rows/row_1')) {
        if (body.status === 'rejected') {
          return jsonResponse(
            { row: { ...batchFixture().rows[0], status: 'rejected' } },
            200
          );
        }
        expect(body.productName).toBe('Kaos Fixed');
        expect(body.skuCode).toBe('KAOS-MERAH-M');
        return jsonResponse(
          {
            row: {
              ...batchFixture().rows[0],
              productName: 'Kaos Fixed',
              status: 'review',
            },
          },
          200
        );
      }
      expect(['reject', 'reopen']).toContain(body.action);
      return jsonResponse(
        {
          batch: {
            ...batchFixture(),
            status: body.action === 'reject' ? 'rejected' : 'review',
          },
        },
        200
      );
    });

    const saved = await patchImportRow(
      WS,
      'imp_1',
      'row_1',
      {
        productName: 'Kaos Fixed',
        skuCode: 'KAOS-MERAH-M',
        sellingPriceCents: 99000,
      },
      { fetchFn }
    );
    expect(saved.productName).toBe('Kaos Fixed');

    const rejected = await patchImportRow(
      WS,
      'imp_1',
      'row_1',
      { status: 'rejected' },
      { fetchFn }
    );
    expect(rejected.status).toBe('rejected');

    const batchRejected = await patchImportBatch(WS, 'imp_1', 'reject', {
      fetchFn,
    });
    expect(batchRejected.status).toBe('rejected');
    const reopened = await patchImportBatch(WS, 'imp_1', 'reopen', { fetchFn });
    expect(reopened.status).toBe('review');
  });

  it('confirms into the catalog with honest duplicates (existingPath)', async () => {
    const existingPath = `/api/workspaces/${WS}/catalog/products/prod_1`;
    const fetchFn = stubFetch(async (url: string) => {
      expect(url).toBe(`/api/workspaces/${WS}/imports/imp_1/confirm`);
      return jsonResponse(
        {
          summary: {
            applied: [
              { rowId: 'row_1', productId: 'prod_1', variantId: 'var_1' },
            ],
            duplicates: [
              {
                rowId: 'row_2',
                skuCode: 'KAOS-MERAH-M',
                existingPath,
                existingVariantId: 'var_1',
                existingProductId: 'prod_1',
              },
            ],
            skipped: [{ rowId: 'row_3', reason: 'rejected in review' }],
          },
          batch: { ...batchFixture(), status: 'applied' },
        },
        200
      );
    });
    const result = await confirmImport(WS, 'imp_1', undefined, { fetchFn });
    expect(result.summary.applied).toHaveLength(1);
    expect(result.summary.duplicates[0]?.existingPath).toBe(existingPath);
    expect(result.summary.duplicates[0]?.existingPath).toContain(
      `/api/workspaces/${WS}/catalog/products/`
    );
    expect(result.batch.status).toBe('applied');
  });

  it('parses rows JSON client-side with strict bounds', () => {
    expect(
      parseRowsJson('[{"product_name": "Kaos", "price": 99000}]')
    ).toMatchObject({ ok: true });
    expect(parseRowsJson('not json')).toMatchObject({ ok: false });
    expect(parseRowsJson('{}')).toMatchObject({ ok: false });
    expect(parseRowsJson('[]')).toMatchObject({ ok: false });
    expect(parseRowsJson('[[]]')).toMatchObject({ ok: false });
  });

  it('maps invalid sessions to re-auth and denials without echoing ids', () => {
    const expired = toImportsClientError(
      401,
      { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
      'en'
    );
    expect(expired.needsReauth).toBe(true);
    expect(expired.message).toBe(getImportsCopy('en').expiredNotice);

    const forbidden = toImportsClientError(
      403,
      { errorCode: 'TENANCY_FORBIDDEN' },
      'en'
    );
    expect(forbidden.message).toBe(getImportsCopy('en').forbiddenError);
    expect(forbidden.message).not.toContain(WS);

    const invalid = toImportsClientError(
      400,
      { errorCode: 'IMPORT_VALIDATION' },
      'en'
    );
    expect(invalid.message).toBe(getImportsCopy('en').validationError);
  });

  it('thrown errors never echo SKUs, prices, reasons, or ids', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { error: 'Invalid request.', errorCode: 'IMPORT_VALIDATION' },
        400
      )
    );
    const err = await uploadImportCsv(
      WS,
      { filename: 'produk.csv', content: 'bad' },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportsClientError);
    const message = (err as ImportsClientError).message;
    expect(message).toBe(getImportsCopy('en').validationError);
    expect(message).not.toContain('KAOS-MERAH-M');
    expect(JSON.stringify(err)).not.toMatch(/SELLER-KAOS|99000|Bearer/);
  });

  it('formats IDR from integer cents without floats', () => {
    expect(formatIdr(99000)).toContain('99');
    expect(formatIdr(null)).toBe('—');
    expect(formatIdr(undefined)).toBe('—');
  });

  it('en/id copy stays in sync with identity-freeze wording', () => {
    const en = getImportsCopy('en');
    const id = getImportsCopy('id');
    expect(Object.keys(id).sort()).toEqual(importsCopyKeys().sort());
    for (const key of importsCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer|tb_session/);
      }
    }
    // Store SKU is always a mapping candidate — never the identity.
    expect(en.rowStoreSkuLabel).toMatch(/mapping candidate/i);
    expect(en.identityFreezeNote).toMatch(/never|only/i);
    expect(en.noLiveChannelNote).toMatch(/No live/i);
  });
});
