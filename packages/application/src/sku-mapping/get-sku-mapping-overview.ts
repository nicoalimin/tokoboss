import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import {
  buildCard,
  type OverviewMappingRow,
} from './sku-mapping-overview-cards';
import type {
  SkuMappingOverview,
  TokobossSkuCardRecord,
} from './sku-mapping-overview-types';
import type { SkuMappingOverviewQueryInput } from './sku-mapping-port-inputs';
import type { SkuMappingReadStore } from './sku-mapping-ports';

/**
 * Petakan Store SKU overview (UTA-40 / US03, RFC 05 task 12b).
 *
 * Any active workspace member (Staff included); other workspace →
 * tenancy forbidden. The store returns the q/connectionId/variantId
 * scope; this use case applies the review filter (CoS 2026-10-27).
 * KPIs count the whole scope, before the filter. Cards sort by skuCode.
 */

/** Route-validated (contracts SkuMappingOverviewFilterSchema). */
export type SkuMappingOverviewFilterKey =
  'all' | 'unmapped_sku' | 'needs_review' | 'conflict' | 'issue';

export interface GetSkuMappingOverviewInput extends SkuMappingOverviewQueryInput {
  filter?: SkuMappingOverviewFilterKey;
}

function matchesFilter(
  card: TokobossSkuCardRecord,
  filter: SkuMappingOverviewFilterKey
): boolean {
  const active = card.mappings.filter((m) => m.archivedAt === null);
  if (filter === 'unmapped_sku') return active.length === 0;
  if (filter === 'needs_review') return card.suggestions.length > 0;
  if (filter === 'conflict') {
    return active.some((m) => m.stockConflict.hasStockConflict);
  }
  if (filter === 'issue') return active.some((m) => m.lifecycleIssue !== null);
  return true;
}

export async function getSkuMappingOverview(
  deps: { reads: Pick<SkuMappingReadStore, 'loadOverview'> },
  ctx: WorkspaceContext | null,
  input: GetSkuMappingOverviewInput
): Promise<SkuMappingOverview> {
  assertSameWorkspace(ctx, input.workspaceId);
  const filter = input.filter ?? 'all';
  const { workspaceId, q, connectionId, variantId } = input;
  const snapshot = await deps.reads.loadOverview({
    workspaceId,
    q,
    connectionId,
    variantId,
  });
  const storesById = new Map(snapshot.stores.map((s) => [s.connectionId, s]));
  const rowsByVariant = new Map<string, OverviewMappingRow[]>();
  for (const row of snapshot.mappings) {
    const list = rowsByVariant.get(row.mapping.variantId) ?? [];
    list.push(row);
    rowsByVariant.set(row.mapping.variantId, list);
  }
  const { openListings } = snapshot;
  const cards = snapshot.variants
    .map((v) =>
      buildCard(v, rowsByVariant.get(v.id) ?? [], openListings, storesById)
    )
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  const active = cards
    .flatMap((c) => c.mappings)
    .filter((m) => m.archivedAt === null);
  const countState = (...states: string[]) =>
    openListings.filter((l) => states.includes(l.mappingState)).length;
  return {
    summary: {
      mappedStoreSkusCount: active.length,
      needsReviewCount: countState('suggested', 'ambiguous'),
      unmappedStoreSkusCount: countState('unmapped'),
      unmappedTokobossSkusCount: cards.filter(
        (c) => c.status === 'active' && matchesFilter(c, 'unmapped_sku')
      ).length,
      stockConflictCount: active.filter((m) => m.stockConflict.hasStockConflict)
        .length,
    },
    stores: snapshot.stores,
    items: cards.filter((c) => matchesFilter(c, filter)),
    unassignedListings: openListings,
  };
}
