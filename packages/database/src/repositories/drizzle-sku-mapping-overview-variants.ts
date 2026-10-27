import { and, eq, exists, ilike, isNull, or } from 'drizzle-orm';
import type {
  CatalogStatus,
  MappableVariantRecord,
  SkuMappingOverviewQueryInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  catalogProducts,
  catalogVariants,
  type CatalogVariantRow,
} from '../schema/index';

/**
 * Overview variant rows for the Drizzle SKU mapping read store (UTA-40 /
 * US03, RFC 05 task 22b). Mirrors loadInMemorySkuMappingOverview: q is a
 * case-insensitive contains over SKU code, product/variant name, barcode
 * or a live mapping's Store SKU hints (scoped to connectionId). Stock
 * totals: drizzle-sku-mapping-overview-stock.ts (22c).
 */

type DbOrTx = Transaction | DatabaseHandle;

export type SkuMappingVariantRow = MappableVariantRecord & {
  productName: string;
  variantName: string | null;
};

/** `%q%` with LIKE wildcards escaped; undefined for a blank q. */
export function containsPattern(q?: string): string | undefined {
  const t = q?.trim();
  return t ? `%${t.replace(/[\\%_]/g, '\\$&')}%` : undefined;
}

/** Variants carry no archived_at: archived status → updatedAt. */
export function toMappableVariant(row: CatalogVariantRow) {
  const { id, productId, skuCode, barcode } = row;
  const status = row.status as CatalogStatus;
  const archivedAt = status === 'archived' ? row.updatedAt : null;
  return { id, productId, skuCode, barcode, status, archivedAt };
}

export async function selectSkuMappingVariants(
  db: DbOrTx,
  input: SkuMappingOverviewQueryInput
): Promise<SkuMappingVariantRow[]> {
  const { workspaceId: ws, connectionId, variantId } = input;
  const v = catalogVariants;
  const p = catalogProducts;
  const m = catalogChannelMappings;
  const pat = containsPattern(input.q);
  const byHint = (like: string) =>
    exists(
      db
        .select({ id: m.id })
        .from(m)
        .where(
          and(
            eq(m.workspaceId, ws),
            eq(m.variantId, v.id),
            isNull(m.archivedAt),
            connectionId ? eq(m.connectionId, connectionId) : undefined,
            or(
              ilike(m.sellerSkuHint, like),
              ilike(m.listingName, like),
              ilike(m.platformSkuId, like)
            )
          )
        )
    );
  const rows: Array<{ v: CatalogVariantRow; productName: string }> = await db
    .select({ v, productName: p.name })
    .from(v)
    .innerJoin(p, eq(p.id, v.productId))
    .where(
      and(
        eq(v.workspaceId, ws),
        variantId ? eq(v.id, variantId) : undefined,
        pat
          ? or(
              ilike(v.skuCode, pat),
              ilike(p.name, pat),
              ilike(v.name, pat),
              ilike(v.barcode, pat),
              byHint(pat)
            )
          : undefined
      )
    )
    .orderBy(v.skuCode);
  return rows.map((r) => ({
    ...toMappableVariant(r.v),
    productName: r.productName,
    variantName: r.v.name,
  }));
}
