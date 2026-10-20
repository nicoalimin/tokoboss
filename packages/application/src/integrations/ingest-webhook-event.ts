import type {
  MarketplaceConnector,
  MarketplaceProvider,
  MarketplaceWebhookEvent,
  MarketplaceWebhookRequest,
} from '@tokoboss/domain';
import { requireEnabledProvider } from './integration-guards';
import type { InboundEventStatus } from './integration-port-inputs';
import type * as ports from './integration-ports';

/**
 * Webhook intake (US20 / RFC 04 task 29). Unknown or disabled provider →
 * 404 (PROVIDER_NOT_AVAILABLE). Bad signature → `unauthorized` (401, log
 * and metric only, nothing stored). Each parsed event is resolved through
 * the global store claim, so it lands in the owning workspace, then
 * dedupe-inserted. Unclaimed, released or removed → `ignored`. The route
 * acks 200 and enqueues `acceptedEventIds` for processing (task 30).
 */

export interface IngestWebhookEventDeps {
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  enabledProviders: readonly MarketplaceProvider[];
  claims: Pick<ports.StoreClaimStore, 'find'>;
  connections: Pick<ports.ConnectionStore, 'find'>;
  events: Pick<ports.InboundEventStore, 'insert'>;
  newId(): string;
}

export type IngestWebhookEventResult =
  | { ack: 'unauthorized' }
  | { ack: 'ok'; acceptedEventIds: string[]; duplicates: number };

type Owner = { workspaceId: string; connectionId: string };

async function resolveOwner(
  deps: IngestWebhookEventDeps,
  provider: MarketplaceProvider,
  providerStoreId: string | null
): Promise<Owner | null> {
  if (!providerStoreId) return null;
  const claim = await deps.claims.find({ provider, providerStoreId });
  if (!claim) return null;
  const row = await deps.connections.find(
    claim.workspaceId,
    claim.connectionId
  );
  if (!row || row.removedAt) return null;
  return { workspaceId: row.workspaceId, connectionId: row.id };
}

export async function ingestWebhookEvent(
  deps: IngestWebhookEventDeps,
  providerSlug: string,
  request: MarketplaceWebhookRequest
): Promise<IngestWebhookEventResult> {
  const provider = requireEnabledProvider(providerSlug, deps.enabledProviders);
  const connector = deps.connectorFor(provider);
  if (!connector.verifyWebhook(request)) return { ack: 'unauthorized' };
  const parsed: readonly MarketplaceWebhookEvent[] = connector.parseWebhook(
    request.rawBody
  );
  const acceptedEventIds: string[] = [];
  let duplicates = 0;
  for (const event of parsed) {
    const owner = await resolveOwner(deps, provider, event.providerStoreId);
    const status: InboundEventStatus = owner ? 'received' : 'ignored';
    const id = deps.newId();
    const inserted = await deps.events.insert({
      id,
      provider,
      dedupeKey: event.dedupeKey,
      eventType: event.eventType,
      providerStoreId: event.providerStoreId,
      connectionId: owner?.connectionId ?? null,
      workspaceId: owner?.workspaceId ?? null,
      payload: event.payload,
      status,
      attempts: 0,
      processedAt: null,
      errorCode: null,
    });
    if (!inserted) duplicates += 1;
    else if (owner) acceptedEventIds.push(id);
  }
  return { ack: 'ok', acceptedEventIds, duplicates };
}
