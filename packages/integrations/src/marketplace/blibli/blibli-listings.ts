import type {
  MarketplaceConnectorContext,
  MarketplaceListingPage,
  MarketplaceListingRow,
} from '@tokoboss/domain';
import {
  blibliCall,
  blibliText,
  type BlibliHttpDeps,
  type BlibliJson,
} from './blibli-http';

/**
 * Blibli product pages → listing rows (UTA-39 / US20, RFC 04 task 60b).
 * Walks `POST /mta/api/businesspartner/v2/product/getProductList` by page
 * number; each item becomes a row with `platform_sku_id = gdnSku` and
 * `external_item_id` = the Blibli product code. The cursor is the next
 * page number as a string. Field names follow the seller-api docs and
 * are read defensively until spike U7 (Blibli UAT). Nothing secret is
 * logged.
 */
export const BLIBLI_PRODUCT_LIST_PATH =
  '/mta/api/businesspartner/v2/product/getProductList';
export const BLIBLI_PRODUCT_PAGE_SIZE = 50;

export function blibliNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** `TOQ-15130-00001-000004` → `TOQ-15130-00001` when no code is sent. */
export function blibliProductCode(item: BlibliJson, gdnSku: string): string {
  const code = blibliText(item.productSku) ?? blibliText(item.productCode);
  return code ?? gdnSku.replace(/-[^-]+$/, '');
}

function blibliStatus(item: BlibliJson): string | null {
  if (item.buyable === true) return 'BUYABLE';
  if (item.buyable === false) return 'NOT_BUYABLE';
  return blibliText(item.status);
}

function blibliPageRows(content: readonly unknown[]): BlibliJson[] {
  return content.filter(
    (row): row is BlibliJson =>
      typeof row === 'object' && row !== null && !Array.isArray(row)
  );
}

/** One page of rows in Blibli's order; blank/duplicate gdnSkus dropped. */
export async function blibliListingsPage(
  deps: BlibliHttpDeps,
  ctx: MarketplaceConnectorContext,
  cursor: string | null
): Promise<MarketplaceListingPage> {
  const page = Math.max(0, Math.trunc(blibliNumber(cursor) ?? 0));
  const data = await blibliCall(deps, ctx, {
    method: 'POST',
    path: BLIBLI_PRODUCT_LIST_PATH,
    body: { page, size: BLIBLI_PRODUCT_PAGE_SIZE },
  });
  const seen = new Set<string>();
  const rows: MarketplaceListingRow[] = [];
  const content = Array.isArray(data.content) ? data.content : [];
  for (const item of blibliPageRows(content)) {
    const gdnSku = blibliText(item.gdnSku);
    if (!gdnSku || seen.has(gdnSku)) continue;
    seen.add(gdnSku);
    rows.push({
      externalItemId: blibliProductCode(item, gdnSku),
      platformSkuId: gdnSku,
      storeSkuText: blibliText(item.merchantSku),
      barcodeHint: blibliText(item.upcCode),
      title: blibliText(item.productName),
      variantName: blibliText(item.itemName),
      listingStatus: blibliStatus(item),
      providerStock:
        blibliNumber(item.stockAvailableLv2) ??
        blibliNumber(item.availableStock),
    });
  }
  const meta = (data.pageMetaData ?? {}) as BlibliJson;
  const total = blibliNumber(meta.totalRecords);
  const more =
    total === null
      ? content.length >= BLIBLI_PRODUCT_PAGE_SIZE
      : (page + 1) * BLIBLI_PRODUCT_PAGE_SIZE < total;
  return { rows, nextCursor: more ? String(page + 1) : null };
}
