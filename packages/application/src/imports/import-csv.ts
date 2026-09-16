import { SkuCode } from '@tokoboss/domain';
import type { ParsedImportRow } from './import-types';

/**
 * CSV + row normalisation for unstructured product imports (UTA-77).
 *
 * Two input shapes feed the same normaliser:
 * - `content`: raw CSV text (the MVP upload shape).
 * - `rows`: pre-parsed objects (the escape hatch for xlsx/photo/PDF
 *   converters — those formats are converted client-side into row objects
 *   so the server stays dependency-free and deterministic).
 *
 * Header matching is case-insensitive with Indonesian/English aliases.
 * Marketplace Store SKU columns (`store_sku`, `seller_sku`,
 * `platform_sku_id`, …) are normalised into mapping-candidate fields and
 * NEVER into `skuCode` (Story 02 freeze).
 */

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_CONTENT_CHARS = 1_000_000;

/** Header aliases (lower-cased, trimmed) → canonical field. */
const HEADER_ALIASES: Record<string, string> = {
  product_name: 'productName',
  product: 'productName',
  name: 'productName',
  nama_produk: 'productName',
  nama_produck: 'productName',
  nama: 'productName',
  sku_tokoboss: 'skuCode',
  skutokoboss: 'skuCode',
  sku_code: 'skuCode',
  skucode: 'skuCode',
  sku: 'skuCode',
  kode_sku: 'skuCode',
  variant_name: 'variantName',
  variant: 'variantName',
  varian: 'variantName',
  nama_varian: 'variantName',
  barcode: 'barcode',
  barcodes: 'barcode',
  selling_price_cents: 'sellingPriceCents',
  selling_price: 'sellingPriceCents',
  price_cents: 'sellingPriceCents',
  price: 'sellingPriceCents',
  harga: 'sellingPriceCents',
  harga_jual: 'sellingPriceCents',
  currency: 'currency',
  mata_uang: 'currency',
  hpp_cents: 'hppCents',
  hpp: 'hppCents',
  modal: 'hppCents',
  cost_source: 'costSource',
  sumber_biaya: 'costSource',
  listing_name: 'listingName',
  nama_listing: 'listingName',
  unit: 'unit',
  satuan: 'unit',
  channel: 'channel',
  kanal: 'channel',
  marketplace: 'channel',
  shop_id: 'shopExtId',
  shop_ext_id: 'shopExtId',
  shopid: 'shopExtId',
  toko: 'shopExtId',
  platform_sku_id: 'platformSkuId',
  platform_sku: 'platformSkuId',
  platformsku: 'platformSkuId',
  store_sku: 'sellerSkuHint',
  seller_sku: 'sellerSkuHint',
  sellersku: 'sellerSkuHint',
  seller_sku_hint: 'sellerSkuHint',
  marketplace_sku: 'sellerSkuHint',
  sku_toko: 'sellerSkuHint',
};

function normaliseHeader(header: string): string | null {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
  return HEADER_ALIASES[key] ?? null;
}

/** Minimal RFC-4180 CSV reader (quotes, escaped quotes, CRLF). */
export function parseCsvText(content: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    current.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Skip fully-blank lines (trailing newline, padded sheets).
    if (current.some((c) => c.trim().length > 0)) rows.push(current);
    current = [];
  };
  while (i < content.length) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      pushField();
      i += 1;
    } else if (ch === '\r') {
      i += 1;
    } else if (ch === '\n') {
      pushRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // Trailing content without a newline still forms a row.
  if (field.length > 0 || current.length > 0) pushRow();
  return rows;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function asNullableText(value: unknown): string | null {
  const t = asText(value);
  return t.length > 0 ? t : null;
}

function asPriceCents(value: unknown): {
  cents: number | null;
  error: string | null;
} {
  const t = asText(value);
  if (t.length === 0) return { cents: null, error: 'price is required' };
  // Tolerate `99.000` / `99,000` thousand separators from sheets.
  const compact = t.replace(/[\s,._]/g, '');
  if (!/^\d+$/.test(compact)) {
    return { cents: null, error: `price ${JSON.stringify(t)} is not a number` };
  }
  const cents = Number.parseInt(compact, 10);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { cents: null, error: `price ${JSON.stringify(t)} is invalid` };
  }
  return { cents, error: null };
}

function asOptionalPriceCents(value: unknown): {
  cents: number | null;
  error: string | null;
} {
  const t = asText(value);
  if (t.length === 0) return { cents: null, error: null };
  const parsed = asPriceCents(value);
  if (parsed.error) {
    return { cents: null, error: parsed.error.replace(/^price/, 'hpp') };
  }
  return parsed;
}

/**
 * Server-generated SKU TokoBoss slug for rows without `sku_tokoboss`.
 * Derived from the product/variant names plus the row number so it is
 * deterministic, URL-safe, and unique within the batch. It is a first-class
 * TokoBoss identity — marketplace codes never flow into it.
 */
export function generateImportSku(
  productName: string,
  variantName: string | null,
  rowNumber: number
): string {
  const slug = `${productName} ${variantName ?? ''}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = `IMP-${String(rowNumber).padStart(4, '0')}${slug ? `-${slug}` : ''}`;
  return base.slice(0, 64);
}

function checkSku(raw: string | null): {
  sku: string | null;
  error: string | null;
} {
  if (raw === null) return { sku: null, error: null };
  try {
    return { sku: SkuCode.parse(raw).value, error: null };
  } catch (err) {
    return {
      sku: null,
      error: err instanceof Error ? err.message : 'SKU code is invalid',
    };
  }
}

function cleanCurrency(value: unknown): string {
  const t = asText(value);
  if (t.length === 0) return 'IDR';
  return t.toUpperCase().slice(0, 3).padEnd(3, 'X');
}

/** Normalise one raw object (from CSV or `rows`) into a parsed candidate. */
export function normaliseImportRow(
  raw: Record<string, unknown>,
  rowNumber: number
): ParsedImportRow {
  const get = (field: string): unknown => raw[field];
  const errors: string[] = [];

  const productName = asText(get('productName'));
  if (productName.length === 0) errors.push('product_name is required');
  else if (productName.length > 200) {
    errors.push('product_name must be at most 200 characters');
  }

  const skuRaw = asNullableText(get('skuCode'));
  const checked = checkSku(skuRaw);
  if (checked.error) errors.push(checked.error);
  const skuCode = checked.sku ?? (skuRaw === null ? '__GENERATED__' : null);

  const price = asPriceCents(get('sellingPriceCents'));
  if (price.error) errors.push(price.error);

  const hpp = asOptionalPriceCents(get('hppCents'));
  if (hpp.error) errors.push(hpp.error);

  const barcode = asNullableText(get('barcode'));
  if (barcode !== null && barcode.length > 64) {
    errors.push('barcode must be at most 64 characters');
  }
  const variantNameRaw = asNullableText(get('variantName'));
  const variantName =
    variantNameRaw !== null && variantNameRaw.length > 200
      ? (errors.push('variant_name must be at most 200 characters'),
        variantNameRaw.slice(0, 200))
      : variantNameRaw;
  const unit = asText(get('unit')) || 'pcs';
  if (unit.length > 24) errors.push('unit must be at most 24 characters');

  return {
    rowNumber,
    raw,
    productName,
    skuCode,
    variantName,
    barcode,
    sellingPriceCents: price.cents,
    currency: cleanCurrency(get('currency')),
    hppCents: hpp.cents,
    costSource: asNullableText(get('costSource'))?.slice(0, 120) ?? null,
    listingName: asNullableText(get('listingName'))?.slice(0, 200) ?? null,
    unit,
    channel: asNullableText(get('channel'))?.slice(0, 40) ?? null,
    shopExtId: asNullableText(get('shopExtId'))?.slice(0, 200) ?? null,
    platformSkuId: asNullableText(get('platformSkuId'))?.slice(0, 200) ?? null,
    sellerSkuHint: asNullableText(get('sellerSkuHint'))?.slice(0, 200) ?? null,
    errors,
  };
}

/** Parse CSV text into normalised candidates (header row required). */
export function parseImportCsv(content: string): ParsedImportRow[] {
  // Strip a UTF-8 BOM so exported sheets still match header aliases.
  const table = parseCsvText(
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  );
  if (table.length === 0) return [];
  const [headerRow, ...dataRows] = table;
  const columns = (headerRow ?? []).map(normaliseHeader);
  if (!columns.some((c) => c !== null)) {
    // No recognisable header — treat every line as unparseable input.
    return dataRows.map((cells, idx) => ({
      rowNumber: idx + 1,
      raw: { line: cells.join(',') },
      productName: '',
      skuCode: null,
      variantName: null,
      barcode: null,
      sellingPriceCents: null,
      currency: 'IDR',
      hppCents: null,
      costSource: null,
      listingName: null,
      unit: 'pcs',
      channel: null,
      shopExtId: null,
      platformSkuId: null,
      sellerSkuHint: null,
      errors: [
        'header row is not recognised (expected product_name, price, …)',
      ],
    }));
  }
  return dataRows.map((cells, idx) => {
    const raw: Record<string, unknown> = {};
    columns.forEach((field, col) => {
      if (field !== null) raw[field] = (cells[col] ?? '').trim();
    });
    return normaliseImportRow(raw, idx + 1);
  });
}

/** Normalise pre-parsed `rows` (xlsx/photo/PDF converter output). */
export function parseImportRows(
  rows: Array<Record<string, unknown>>
): ParsedImportRow[] {
  return rows.map((row, idx) => {
    const raw: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const field = normaliseHeader(key);
      if (field !== null) raw[field] = value;
    }
    return normaliseImportRow(raw, idx + 1);
  });
}
