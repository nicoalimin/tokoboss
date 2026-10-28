import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceConnectorErrorKind,
  type MarketplaceListingRow,
  type MarketplaceStockPushInput,
  type MarketplaceStockPushResult,
} from '@tokoboss/domain';

/**
 * Fake stock push for `createFakeMarketplaceConnector` (UTA-37 / US04,
 * RFC 06 task 6). Absolute quantities only: a push replaces the matching
 * fixture listing's `providerStock` with the sum of its targets.
 */
export interface FakeStockPushFixture {
  /** When set, every `pushInventory` call throws this kind. */
  readonly failPushInventory?: MarketplaceConnectorErrorKind;
}

/** Fake connector extras: a required `pushInventory` plus its push log. */
export interface FakeStockPushCapability {
  readonly pushInventory: NonNullable<MarketplaceConnector['pushInventory']>;
  readonly pushedInventory: readonly MarketplaceStockPushInput[];
}

export interface FakeStockPushState {
  readonly listingPages: MarketplaceListingRow[][];
  readonly pushedInventory: MarketplaceStockPushInput[];
  readonly fail: MarketplaceConnectorErrorKind | undefined;
}

export function createFakeStockPushState(
  listingPages: readonly (readonly MarketplaceListingRow[])[],
  fail?: MarketplaceConnectorErrorKind
): FakeStockPushState {
  const pages = listingPages.map((page) => [...page]);
  return { listingPages: pages, pushedInventory: [], fail };
}

export function fakePushInventory(
  state: FakeStockPushState,
  input: MarketplaceStockPushInput
): MarketplaceStockPushResult {
  if (state.fail) {
    throw new MarketplaceConnectorError(state.fail, `FAKE_PUSH_${state.fail}`);
  }
  const pushedQty = input.targets.reduce((sum, t) => sum + t.quantity, 0);
  for (const page of state.listingPages) {
    page.forEach((row, index) => {
      if (
        row.externalItemId === input.externalItemId &&
        row.platformSkuId === input.platformSkuId
      ) {
        page[index] = { ...row, providerStock: pushedQty };
      }
    });
  }
  state.pushedInventory.push(input);
  const targets = input.targets.map((target) => ({
    ...target,
    success: true,
    errorKind: null,
    errorCode: null,
  }));
  return { pushedQty, targets };
}
