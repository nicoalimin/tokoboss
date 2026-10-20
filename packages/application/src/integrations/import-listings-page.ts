import type {
  MarketplaceConnector,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { ListingUpsertInput } from './integration-port-inputs';
import type * as ports from './integration-ports';
import {
  suggestListingMatches,
  type MatchableVariant,
} from './suggest-listing-matches';

export interface ImportListingsPageDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  vault: Pick<ports.CredentialVault, 'open'>;
  listings: Pick<ports.ListingStore, 'upsertPage'>;
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  /** Workspace catalog variants that have a sku_code or a barcode. */
  matchableVariants(workspaceId: string): Promise<MatchableVariant[]>;
  /** platformSkuIds with a non-archived channel mapping for this store. */
  mappedPlatformSkuIds(input: {
    workspaceId: string;
    provider: MarketplaceProvider;
    providerStoreId: string;
  }): Promise<ReadonlySet<string>>;
  now(): Date;
}

export interface ImportListingsPageInput {
  workspaceId: string;
  connectionId: string;
  /** null for the first page; the saved cursor when resuming. */
  cursor: string | null;
}

export type ImportListingsPageResult =
  | { outcome: 'skipped' }
  | { outcome: 'page'; imported: number; nextCursor: string | null };

/**
 * Import one listing page (US20 / RFC 04 task 32a). Runs only while the
 * connection is connected; fetches one provider page (adapters page at
 * ≤100 rows), attaches matcher suggestions (never writes mappings) and
 * upserts by (connection, platformSkuId). Connector errors such as
 * rate_limited propagate to the import step runner (task 32b).
 */
export async function importListingsPage(
  deps: ImportListingsPageDeps,
  input: ImportListingsPageInput
): Promise<ImportListingsPageResult> {
  const { workspaceId, connectionId } = input;
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.status !== 'connected' || row.removedAt) {
    return { outcome: 'skipped' };
  }
  const credentials = await deps.vault.open(connectionId);
  if (!credentials) return { outcome: 'skipped' };
  const { provider, providerStoreId } = row;
  const page = await deps
    .connectorFor(provider)
    .listListingsPage({ provider, shop: row, credentials }, input.cursor);
  const [variants, mappedPlatformSkuIds] = await Promise.all([
    deps.matchableVariants(workspaceId),
    deps.mappedPlatformSkuIds({ workspaceId, provider, providerStoreId }),
  ]);
  const matches = suggestListingMatches({
    listings: page.rows,
    variants,
    mappedPlatformSkuIds,
  });
  const lastSeenAt = deps.now();
  const rows: ListingUpsertInput[] = page.rows.map((listing, i) => ({
    ...listing,
    mappingState: matches[i]?.mappingState ?? 'unmapped',
    suggestedVariantIds: matches[i]?.suggestedVariantIds ?? [],
    lastSeenAt,
  }));
  const imported =
    rows.length === 0
      ? 0
      : await deps.listings.upsertPage({ workspaceId, connectionId }, rows);
  return { outcome: 'page', imported, nextCursor: page.nextCursor };
}
