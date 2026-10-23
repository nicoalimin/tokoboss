/**
 * Integration Center (Integrasi) UI copy, Bahasa Indonesia first (US20 /
 * RFC 04 task 100a): page, the four statuses and store-row actions.
 * Capability, consent and problem strings live in sibling copy files. Keys
 * stay in sync across locales; strings never echo tokens, keys or other
 * workspaces.
 */
import type {
  IntegrationConnectionView,
  MarketplaceProviderWire,
} from '@tokoboss/contracts';

export type IntegrationLang = 'id' | 'en';

/** `not_connected` is the absence of a row, not a stored status. */
export type IntegrationStatusKey =
  'not_connected' | IntegrationConnectionView['status'];

/** Brand names are not translated. */
export const INTEGRATION_PROVIDER_NAMES: Record<
  MarketplaceProviderWire,
  string
> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop', blibli: 'Blibli' };
/** CoS O2: Tokopedia shops ride the TikTok Shop connection. */
export const TOKOPEDIA_LABEL = 'Tokopedia (via TikTok Shop)';

export interface IntegrationCopy {
  pageTitle: string;
  pageSubtitle: string;
  connectButton: string;
  adminOnlyNote: string;
  askAdmin: string;
  status: Record<IntegrationStatusKey, string>;
  storeCount: (n: number) => string;
  storeIdLabel: string;
  lastChecked: (time: string) => string;
  emptyStores: string;
  emptyStoresHint: string;
  addStore: string;
  reauthorize: string;
  viewAndReconnect: string;
  connectProvider: (provider: string) => string;
}

const id: IntegrationCopy = {
  pageTitle: 'Pusat integrasi',
  pageSubtitle:
    'Satu tempat untuk semua toko marketplace. Satu penyedia dapat memiliki beberapa toko; tiap toko dikenali dari ID toko penyedia, bukan dari namanya.',
  connectButton: '+ Hubungkan toko',
  adminOnlyNote: 'Hanya Admin yang dapat menghubungkan',
  askAdmin: 'Minta Admin',
  status: {
    not_connected: 'Belum terhubung',
    connected: 'Terhubung',
    needs_reauth: 'Perlu otorisasi ulang',
    disconnected: 'Terputus',
  },
  storeCount: (n) => `${n} toko`,
  storeIdLabel: 'ID toko',
  lastChecked: (time) => `cek ${time}`,
  emptyStores: 'Belum ada toko',
  emptyStoresHint: 'Hubungkan untuk impor order & sinkron stok',
  addStore: '+ Toko lain',
  reauthorize: 'Otorisasi ulang',
  viewAndReconnect: 'Lihat & hubungkan lagi',
  connectProvider: (provider) => `Hubungkan ${provider}`,
};

const en: IntegrationCopy = {
  pageTitle: 'Integration center',
  pageSubtitle:
    'One place for every marketplace store. A provider can have several stores; each store is identified by the provider store ID, not its name.',
  connectButton: '+ Connect store',
  adminOnlyNote: 'Only an Admin can connect stores',
  askAdmin: 'Ask an Admin',
  status: {
    not_connected: 'Not connected',
    connected: 'Connected',
    needs_reauth: 'Needs reauthorization',
    disconnected: 'Disconnected',
  },
  storeCount: (n) => (n === 1 ? '1 store' : `${n} stores`),
  storeIdLabel: 'Store ID',
  lastChecked: (time) => `checked ${time}`,
  emptyStores: 'No stores yet',
  emptyStoresHint: 'Connect to import orders & sync stock',
  addStore: '+ Another store',
  reauthorize: 'Reauthorize',
  viewAndReconnect: 'View & reconnect',
  connectProvider: (provider) => `Connect ${provider}`,
};

const COPIES: Record<IntegrationLang, IntegrationCopy> = { id, en };

export function getIntegrationCopy(
  lang: IntegrationLang = 'id'
): IntegrationCopy {
  return COPIES[lang] ?? COPIES.id;
}
