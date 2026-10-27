import { and, eq } from 'drizzle-orm';
import {
  skuMappingVersionConflict,
  type StoreSkuKey,
  type UpsertSkuMappingInput,
  type UpsertSkuMappingResult,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  type CatalogChannelMappingRow,
} from '../schema/index';
import { toSkuMappingRecord } from './drizzle-sku-mapping-mappers';

/**
 * Store SKU key lookup + upsert for the Drizzle SKU mapping write store
 * (UTA-40 / US03, RFC 05 task 21a). Mirrors inMemoryUpsertMapping:
 * new → v1; restore or repoint → version + 1; same variant keeps it.
 * Runs inside the SkuMappingTxRunner transaction (row 23).
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Any row (live or archived) with the key, row-locked FOR UPDATE. */
export async function lockSkuMappingByKey(
  db: DbOrTx,
  key: StoreSkuKey
): Promise<CatalogChannelMappingRow | null> {
  const m = catalogChannelMappings;
  const rows: CatalogChannelMappingRow[] = await db
    .select()
    .from(m)
    .where(
      and(
        eq(m.workspaceId, key.workspaceId),
        eq(m.channel, key.channel),
        eq(m.shopExtId, key.shopExtId),
        eq(m.platformSkuId, key.platformSkuId)
      )
    )
    .limit(1)
    .for('update');
  return rows[0] ?? null;
}

export async function upsertSkuMappingRow(
  db: DbOrTx,
  input: UpsertSkuMappingInput
): Promise<UpsertSkuMappingResult> {
  const { expectedVersion, ...fields } = input;
  const now = new Date();
  const row = await lockSkuMappingByKey(db, input);
  if (!row) {
    const inserted: CatalogChannelMappingRow[] = await db
      .insert(catalogChannelMappings)
      .values({ ...fields, version: 1, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    const created = inserted[0];
    // A concurrent first map of the same key won the unique index.
    if (!created) throw skuMappingVersionConflict(1);
    return { mapping: toSkuMappingRecord(created), previous: null };
  }
  const live = row.archivedAt === null;
  const repoint = live && row.variantId !== input.variantId;
  if (repoint && expectedVersion !== row.version) {
    throw skuMappingVersionConflict(row.version);
  }
  const version = live && !repoint ? row.version : row.version + 1;
  const updated: CatalogChannelMappingRow[] = await db
    .update(catalogChannelMappings)
    .set({ ...fields, archivedAt: null, updatedAt: now, version })
    .where(
      and(
        eq(catalogChannelMappings.workspaceId, input.workspaceId),
        eq(catalogChannelMappings.id, row.id)
      )
    )
    .returning();
  const mapping = updated[0];
  if (!mapping) throw skuMappingVersionConflict(row.version);
  return {
    mapping: toSkuMappingRecord(mapping),
    previous: live ? toSkuMappingRecord(row) : null,
  };
}
