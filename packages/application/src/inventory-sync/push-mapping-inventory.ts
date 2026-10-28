import {
  computeDesiredLocationStocks,
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { ensureFreshAccessToken } from '../integrations/ensure-fresh-access-token';
import {
  mapConnectorFailureToSyncError,
  type InventorySyncFailureCode,
} from './inventory-sync-errors';
import type { InventorySyncDeps } from './inventory-sync-ports';
import {
  recordSyncAttempt,
  type SyncAttempt,
  type SyncAttemptResult,
} from './record-sync-attempt';

export type PushMappingInventoryInput = { workspaceId: string } & Pick<
  SyncAttempt,
  'trigger' | 'actorId' | 'correlationId'
> & { mappingId: string };

const TOKEN_FAILURE = {
  needs_reauth: 'SYNC_NEEDS_REAUTH',
  unavailable: 'SYNC_STORE_DISCONNECTED',
  retry_later: 'SYNC_PROVIDER_UNAVAILABLE',
} as const satisfies Record<string, InventorySyncFailureCode>;

const retryable = (err: unknown) =>
  err instanceof MarketplaceConnectorError &&
  (err.kind === 'rate_limited' || err.kind === 'unavailable');

/**
 * Pushes one Store SKU's absolute stock (UTA-37 / US04, RFC 06 task 24b):
 * fresh read, lazy token refresh, 1 bounded retry on rate_limited /
 * unavailable, CAS commit (24a). Failures → needs_attention, never thrown;
 * null = mapping gone or sync off. skipped_stale catch-up is task 25's.
 */
export async function pushMappingInventory(
  deps: InventorySyncDeps,
  input: PushMappingInventoryInput
): Promise<SyncAttemptResult | null> {
  const { workspaceId, mappingId } = input;
  const mapping = await deps.reads.loadMappingContext(workspaceId, mappingId);
  const state = mapping?.state;
  if (mapping?.workspaceId !== workspaceId || !state?.syncEnabled) return null;

  const computed = computeDesiredLocationStocks({
    provider: mapping.channel,
    warehouses: mapping.warehouses,
    locationLinks: mapping.locationLinks,
    stockBuffer: state.stockBuffer,
    allocationPct: state.allocationPct,
  });
  const { desiredQty, targets } = computed;
  const attempt = { ...input, mapping, attemptSeq: state.syncSeq, desiredQty };
  const fail = (errorCode: InventorySyncFailureCode) =>
    recordSyncAttempt(deps, attempt, { errorCode });

  const { connectionId, externalItemId, platformSkuId } = mapping;
  if (!connectionId) return fail('SYNC_STORE_DISCONNECTED');
  if (computed.status !== 'ok') return fail('SYNC_LOCATION_UNLINKED');
  if (!externalItemId) return fail('SYNC_LISTING_INVALID');
  const ref = { workspaceId, connectionId };
  const token = await ensureFreshAccessToken(deps.tokenDeps, ref);
  if (token.status !== 'fresh') return fail(TOKEN_FAILURE[token.status]);
  const connector = deps.connectors.connectorFor(mapping.channel);
  const pushInventory = connector.pushInventory?.bind(connector);
  if (!pushInventory) return fail('SYNC_PROVIDER_UNAVAILABLE');
  const c = token.connection;
  const ctx: MarketplaceConnectorContext = {
    provider: mapping.channel,
    credentials: token.credentials,
    shop: {
      providerStoreId: c.providerStoreId,
      providerAccountId: c.providerAccountId,
      shopCipher: c.shopCipher,
      storeName: c.storeName,
      region: c.region,
    },
  };
  const send = () =>
    pushInventory(ctx, { externalItemId, platformSkuId, targets });
  const result = await send()
    .catch(async (err: unknown) => {
      if (!retryable(err)) throw err;
      await new Promise((r) => setTimeout(r, deps.retryBackoffMs ?? 150));
      return send();
    })
    .catch(mapConnectorFailureToSyncError);
  if ('errorCode' in result) return fail(result.errorCode);
  if (result.targets.some((t) => !t.success)) {
    return fail('SYNC_LISTING_INVALID');
  }
  const { pushedQty } = result;
  await deps.writes.setListingProviderStock({
    ...ref,
    platformSkuId,
    providerStock: pushedQty,
  });
  return recordSyncAttempt(deps, attempt, { pushedQty });
}
