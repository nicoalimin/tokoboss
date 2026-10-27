import { InMemorySkuMappingReadStore } from './in-memory-sku-mapping-reads';
import {
  nextSkuMappingId,
  snapshotSkuMappingState,
} from './in-memory-sku-mapping-state';
import {
  inMemoryMappingByKey,
  inMemoryRecomputeListing,
  inMemoryUpsertMapping,
} from './in-memory-sku-mapping-writes';
import { skuMappingNotFound } from './sku-mapping-errors';
import type {
  AppendSkuMappingEventInput,
  StoreSkuKey,
  UpsertSkuMappingInput,
} from './sku-mapping-port-inputs';
import type { SkuMappingStore, SkuMappingTxRunner } from './sku-mapping-ports';

/**
 * InMemorySkuMappingStore (UTA-40 / US03, RFC 05 task 17e): the read
 * fake (17c) plus SkuMappingStore writes (17d helpers) and a tx runner
 * that restores the rows when the callback throws. One instance serves
 * as deps.reads and deps.tx in unit and memory-mode web tests.
 */
export class InMemorySkuMappingStore
  extends InMemorySkuMappingReadStore
  implements SkuMappingStore, SkuMappingTxRunner
{
  async run<T>(fn: (store: SkuMappingStore) => Promise<T>): Promise<T> {
    const restore = snapshotSkuMappingState(this.state);
    try {
      return await fn(this);
    } catch (error) {
      restore();
      throw error;
    }
  }

  async findMappingByStoreSku(key: StoreSkuKey) {
    const row = inMemoryMappingByKey(this.state, key);
    return row && row.archivedAt === null ? { ...row } : null;
  }

  async upsertMapping(input: UpsertSkuMappingInput) {
    return inMemoryUpsertMapping(this.state, input);
  }

  /** Archives (version unchanged); null when absent or archived. */
  async deleteMapping(workspaceId: string, mappingId: string) {
    const row = this.state.mappings.find(
      (m) =>
        m.workspaceId === workspaceId &&
        m.id === mappingId &&
        m.archivedAt === null
    );
    if (!row) return null;
    const now = this.state.now();
    Object.assign(row, { archivedAt: now, updatedAt: now });
    return { ...row };
  }

  async setListingMapped(workspaceId: string, listingId: string) {
    const row = this.stagedListing(workspaceId, listingId);
    if (!row) return;
    Object.assign(row, { mappingState: 'mapped', suggestedVariantIds: [] });
  }

  async recomputeListingMatchState(workspaceId: string, listingId: string) {
    const row = this.stagedListing(workspaceId, listingId);
    if (!row) throw skuMappingNotFound('staged listing');
    return inMemoryRecomputeListing(this.state, row);
  }

  async appendHistoryEvent(input: AppendSkuMappingEventInput) {
    const id = nextSkuMappingId(this.state, 'evt');
    const event = { ...input, id, createdAt: this.state.now() };
    this.state.events.push(event);
    return { ...event };
  }
}
