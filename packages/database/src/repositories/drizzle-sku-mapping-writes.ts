import { and, eq, isNull } from 'drizzle-orm';
import type {
  AppendSkuMappingEventInput,
  SkuMappingEventRecord,
  SkuMappingRecord,
  SkuMappingStore,
  StoreSkuKey,
  UpsertSkuMappingInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappingEvents,
  catalogChannelMappings,
  marketplaceListings,
  type CatalogChannelMappingEventRow,
  type CatalogChannelMappingRow,
} from '../schema/index';
import {
  toSkuMappingEventRecord,
  toSkuMappingRecord,
} from './drizzle-sku-mapping-mappers';
import { recomputeSkuListingMatchState } from './drizzle-sku-mapping-recompute';
import {
  lockSkuMappingByKey,
  upsertSkuMappingRow,
} from './drizzle-sku-mapping-upsert';

/**
 * DrizzleSkuMappingWriteStore (UTA-40 / US03, RFC 05 task 21c): the
 * SkuMappingStore port on one Postgres transaction handle. The facade
 * (row 23) builds one per SkuMappingTxRunner.run, so mapping, listing
 * state and history commit or roll back together (AC5). Key lookup and
 * upsert: drizzle-sku-mapping-upsert.ts (21a); recompute: 21b.
 */

type DbOrTx = Transaction | DatabaseHandle;

export class DrizzleSkuMappingWriteStore implements SkuMappingStore {
  constructor(private readonly db: DbOrTx) {}

  async findMappingByStoreSku(
    key: StoreSkuKey
  ): Promise<SkuMappingRecord | null> {
    const row = await lockSkuMappingByKey(this.db, key);
    return row && row.archivedAt === null ? toSkuMappingRecord(row) : null;
  }

  upsertMapping(input: UpsertSkuMappingInput) {
    return upsertSkuMappingRow(this.db, input);
  }

  /** Archives (version unchanged); null when absent or archived. */
  async deleteMapping(
    workspaceId: string,
    mappingId: string
  ): Promise<SkuMappingRecord | null> {
    const m = catalogChannelMappings;
    const now = new Date();
    const rows: CatalogChannelMappingRow[] = await this.db
      .update(m)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(m.workspaceId, workspaceId),
          eq(m.id, mappingId),
          isNull(m.archivedAt)
        )
      )
      .returning();
    return rows[0] ? toSkuMappingRecord(rows[0]) : null;
  }

  async setListingMapped(workspaceId: string, listingId: string) {
    const l = marketplaceListings;
    await this.db
      .update(l)
      .set({
        mappingState: 'mapped',
        suggestedVariantIds: [],
        updatedAt: new Date(),
      })
      .where(and(eq(l.workspaceId, workspaceId), eq(l.id, listingId)));
  }

  recomputeListingMatchState(workspaceId: string, listingId: string) {
    return recomputeSkuListingMatchState(this.db, workspaceId, listingId);
  }

  async appendHistoryEvent(
    input: AppendSkuMappingEventInput
  ): Promise<SkuMappingEventRecord> {
    const rows: CatalogChannelMappingEventRow[] = await this.db
      .insert(catalogChannelMappingEvents)
      .values(input)
      .returning();
    const row = rows[0];
    if (!row) throw new Error('SKU_MAPPING_CORRUPT: history insert');
    return toSkuMappingEventRecord(row);
  }
}
