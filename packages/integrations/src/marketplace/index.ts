/**
 * Marketplace adapters barrel (UTA-39 / US20, RFC 04 task 65): the public
 * surface of the Shopee, TikTok Shop and Blibli connectors, the fixture
 * fake and the provider registry. Clients, signers and HTTP helpers stay
 * internal to each provider folder.
 */
export * from './connector-registry';
export {
  BLIBLI_CAPABILITIES,
  createBlibliConnector,
  type BlibliConnectorConfig,
} from './blibli/blibli-connector';
export {
  SHOPEE_CAPABILITIES,
  createShopeeConnector,
  type ShopeeConnectorConfig,
} from './shopee/shopee-connector';
export {
  createTikTokConnector,
  type TikTokConnectorConfig,
} from './tiktok-shop/tiktok-connector';
export {
  createFakeMarketplaceConnector,
  fakeParseWebhook,
  type FakeMarketplaceFixture,
} from './fake/fake-marketplace-connector';
