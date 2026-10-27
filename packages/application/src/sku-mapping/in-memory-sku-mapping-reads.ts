import {
  inMemoryListingOf,
  loadInMemorySkuMappingOverview,
} from './in-memory-sku-mapping-overview';
import {
  createSkuMappingState,
  type InMemorySkuMappingState,
  unscope,
} from './in-memory-sku-mapping-state';
import type { SkuMappingOverviewQueryInput } from './sku-mapping-port-inputs';
import type { SkuMappingReadStore } from './sku-mapping-ports';
import type { SkuMappingHistoryEntry } from './sku-mapping-types';

type HistoryQuery = Parameters<SkuMappingReadStore['listHistory']>[0];

/**
 * In-memory SkuMappingReadStore test fake (UTA-40 / US03, RFC 05 task
 * 17c) over seedable state (17a). Workspace-scoped like Drizzle: rows of
 * another workspace miss (null / empty). Returns copies, never state.
 */
export class InMemorySkuMappingReadStore implements SkuMappingReadStore {
  constructor(
    readonly state: InMemorySkuMappingState = createSkuMappingState()
  ) {}

  protected stagedListing(workspaceId: string, listingId: string) {
    return this.state.listings.find(
      (l) => l.workspaceId === workspaceId && l.listingId === listingId
    );
  }

  async loadOverview(input: SkuMappingOverviewQueryInput) {
    return loadInMemorySkuMappingOverview(this.state, input);
  }

  /** Newest first; variantId also matches remaps away from it. */
  async listHistory(input: HistoryQuery): Promise<SkuMappingHistoryEntry[]> {
    const { workspaceId, variantId, limit } = input;
    const { variants, stores, actorNames } = this.state;
    const sku = (id: string | null) =>
      variants.find((v) => v.workspaceId === workspaceId && v.id === id)
        ?.skuCode ?? null;
    const storeName = (id: string | null) =>
      stores.find((s) => s.workspaceId === workspaceId && s.connectionId === id)
        ?.displayName ?? null;
    return this.state.events
      .filter(
        (e) =>
          e.workspaceId === workspaceId &&
          (!variantId || [e.variantId, e.previousVariantId].includes(variantId))
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id)
      )
      .slice(0, limit)
      .map((e) => ({
        ...e,
        skuCode: sku(e.variantId),
        previousSkuCode: sku(e.previousVariantId),
        storeDisplayName: storeName(e.connectionId),
        actorDisplayName: actorNames[e.actorId] ?? '',
      }));
  }

  async findVariant(workspaceId: string, variantId: string) {
    const v = this.state.variants.find(
      (row) => row.workspaceId === workspaceId && row.id === variantId
    );
    if (!v) return null;
    const { id, productId, skuCode, barcode, status, archivedAt } = v;
    return { id, productId, skuCode, barcode, status, archivedAt };
  }

  async findListing(workspaceId: string, listingId: string) {
    const row = this.stagedListing(workspaceId, listingId);
    return row ? unscope(row) : null;
  }

  /** Live (non-archived) mapping only; archived → null (use case 404s). */
  async findMapping(workspaceId: string, mappingId: string) {
    const mapping = this.state.mappings.find(
      (m) =>
        m.workspaceId === workspaceId &&
        m.id === mappingId &&
        m.archivedAt === null
    );
    if (!mapping) return null;
    return {
      mapping: { ...mapping },
      listing: inMemoryListingOf(this.state, mapping),
    };
  }
}
