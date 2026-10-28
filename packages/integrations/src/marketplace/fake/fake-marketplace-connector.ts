import {
  deriveCapabilities,
  MARKETPLACE_CONNECT_MODES,
  MarketplaceConnectorError,
  type MarketplaceCapabilities,
  type MarketplaceConnector,
  type MarketplaceConnectorErrorKind,
  type MarketplaceCredentials,
  type MarketplaceListingRow,
  type MarketplaceLocation,
  type MarketplaceOrderPreviewRow,
  type MarketplaceProvider,
  type MarketplaceShop,
  type MarketplaceWebhookEvent,
} from '@tokoboss/domain';
import {
  createFakeStockPushState,
  fakePushInventory,
  type FakeStockPushCapability,
  type FakeStockPushFixture,
} from './fake-stock-push';

/**
 * Fixture-driven fake `MarketplaceConnector` (UTA-39 / US20, RFC 04 task
 * 63) covering all three shapes: Shopee/TikTok Shop `oauth_redirect`,
 * Blibli `credential_binding`. No network, clock or DB; a fixture `fail`
 * kind makes every provider call throw that error, `failPushInventory`
 * only stock pushes (UTA-37 / US04, RFC 06 task 7).
 */
export interface FakeMarketplaceFixture extends FakeStockPushFixture {
  readonly provider: MarketplaceProvider;
  readonly shops: readonly MarketplaceShop[];
  readonly credentials: MarketplaceCredentials;
  readonly listingPages?: readonly (readonly MarketplaceListingRow[])[];
  readonly locations?: readonly MarketplaceLocation[];
  readonly orders?: readonly MarketplaceOrderPreviewRow[];
  readonly capabilities?: Partial<MarketplaceCapabilities>;
  readonly missingPermissions?: readonly string[];
  /** Header `x-fake-signature` must equal this; unset fails closed. */
  readonly webhookSecret?: string;
  readonly fail?: MarketplaceConnectorErrorKind;
}

/** Body is a JSON array of `{ id, type, shopId }`; bad input → none. */
export function fakeParseWebhook(
  provider: MarketplaceProvider,
  rawBody: string
): MarketplaceWebhookEvent[] {
  let items: unknown;
  try {
    items = JSON.parse(rawBody);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const { id, type, shopId } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof type !== 'string') return [];
    const store = typeof shopId === 'string' ? shopId : null;
    const event = { eventType: type, providerStoreId: store, payload: item };
    return [{ dedupeKey: `${provider}:${id}`, ...event }];
  });
}

export function createFakeMarketplaceConnector(
  fixture: FakeMarketplaceFixture
): MarketplaceConnector & FakeStockPushCapability {
  const { provider, credentials } = fixture;
  const connectMode = MARKETPLACE_CONNECT_MODES[provider];
  const pushState = createFakeStockPushState(
    fixture.listingPages ?? [],
    fixture.failPushInventory
  );
  const pages = pushState.listingPages;
  async function call<T>(value: () => T): Promise<T> {
    if (fixture.fail) {
      throw new MarketplaceConnectorError(fixture.fail, `FAKE_${fixture.fail}`);
    }
    return value();
  }
  const oauthOnly = (): void => {
    if (connectMode !== 'oauth_redirect') {
      throw new MarketplaceConnectorError('bad_request', 'FAKE_NO_OAUTH');
    }
  };
  return {
    provider,
    connectMode,
    buildAuthorizeUrl: ({ state, redirectUri }) => {
      oauthOnly();
      const query = new URLSearchParams({ state, redirect_uri: redirectUri });
      return `https://fake-marketplace.invalid/${provider}/authorize?${query}`;
    },
    exchangeAuthCode: async () => {
      oauthOnly();
      return call(() => ({ credentials, shops: fixture.shops }));
    },
    refresh: () => call(() => credentials),
    validateCredentials: () => call(() => undefined),
    describeCapabilities: () => ({
      capabilities: deriveCapabilities(fixture.capabilities ?? {}),
      missingPermissions: fixture.missingPermissions ?? [],
    }),
    listLocations: () => call(() => fixture.locations ?? []),
    listListingsPage: (_ctx, cursor) =>
      call(() => {
        const index = cursor === null ? 0 : Number(cursor);
        const next = index + 1 < pages.length ? String(index + 1) : null;
        return { rows: pages[index] ?? [], nextCursor: next };
      }),
    listRecentOrders: (_ctx, window) =>
      call(() => (fixture.orders ?? []).slice(0, window.limit)),
    verifyWebhook: ({ headers }) =>
      fixture.webhookSecret !== undefined &&
      headers['x-fake-signature'] === fixture.webhookSecret,
    parseWebhook: (rawBody) => fakeParseWebhook(provider, rawBody),
    pushInventory: (_ctx, input) =>
      call(() => fakePushInventory(pushState, input)),
    pushedInventory: pushState.pushedInventory,
  };
}
