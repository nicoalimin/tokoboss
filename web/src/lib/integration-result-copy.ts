/**
 * Connect success screen copy, Bahasa Indonesia first (US20 / RFC 04 task
 * 115a, CoS split of row 115): mockup v2 screen 3 heading and sub-line, the
 * store detail labels, granted permissions, the four import counts (sync
 * stays Mati), the three next steps and the Store SKU note. The Terhubung
 * pill is status.connected and "ID toko" is storeIdLabel in
 * integration-copy.ts. Strings never echo tokens, keys or other workspaces.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationResultCopy {
  navLabel: string;
  heading: string;
  intro: string;
  providerLabel: string;
  storeNameLabel: string;
  connectedByLabel: string;
  /** `who` e.g. "Nico (Admin)"; `time` already formatted, e.g. in WIB. */
  connectedBy: (who: string, time: string) => string;
  grantedHeading: string;
  grantedScopes: readonly string[];
  listingsImported: string;
  storeSkusMapped: string;
  ordersImported: string;
  syncLabel: string;
  syncOff: string;
  nextStepsTitle: string;
  /** Steps 1–3 in order; ConnectResult (115b) adds the "1 · " prefix. */
  nextSteps: readonly [string, string, string];
  storeSkuNote: string;
}

const id: IntegrationResultCopy = {
  navLabel: 'Toko baru',
  heading: 'Toko terhubung',
  intro: 'Siap dipetakan. Belum ada stok yang didorong ke marketplace.',
  providerLabel: 'Penyedia',
  storeNameLabel: 'Nama toko',
  connectedByLabel: 'Dihubungkan oleh',
  connectedBy: (who, time) => `${who} · ${time}`,
  grantedHeading: 'Izin diberikan',
  grantedScopes: [
    'Info toko',
    'Produk & varian',
    'Pesanan',
    'Perbarui stok (belum aktif)',
  ],
  listingsImported: 'listing diimpor untuk ditinjau',
  storeSkusMapped: 'Store SKU terpetakan',
  ordersImported: 'order terbaru diimpor',
  syncLabel: 'sinkron stok',
  syncOff: 'Mati',
  nextStepsTitle: 'Langkah berikutnya',
  nextSteps: [
    'Petakan Store SKU ke SKU TokoBoss (Story 03)',
    'Pilih gudang sumber',
    'Aktifkan sinkron stok (Story 04)',
  ],
  storeSkuNote:
    'Store SKU dikenali dari tuple (channel, shop_ext_id, platform_sku_id); kode SKU penjual hanya petunjuk pencocokan.',
};

const en: IntegrationResultCopy = {
  navLabel: 'New store',
  heading: 'Store connected',
  intro: 'Ready to map. No stock has been pushed to the marketplace yet.',
  providerLabel: 'Provider',
  storeNameLabel: 'Store name',
  connectedByLabel: 'Connected by',
  connectedBy: (who, time) => `${who} · ${time}`,
  grantedHeading: 'Permissions granted',
  grantedScopes: [
    'Store info',
    'Products & variants',
    'Orders',
    'Update stock (not active yet)',
  ],
  listingsImported: 'listings imported for review',
  storeSkusMapped: 'Store SKUs mapped',
  ordersImported: 'recent orders imported',
  syncLabel: 'inventory sync',
  syncOff: 'Off',
  nextStepsTitle: 'Next steps',
  nextSteps: [
    'Map Store SKUs to TokoBoss SKUs (Story 03)',
    'Choose source warehouse',
    'Enable inventory sync (Story 04)',
  ],
  storeSkuNote:
    'A Store SKU is identified by the tuple (channel, shop_ext_id, platform_sku_id); the seller SKU code is only a matching hint.',
};

const COPIES: Record<IntegrationLang, IntegrationResultCopy> = { id, en };

export function getIntegrationResultCopy(
  lang: IntegrationLang = 'id'
): IntegrationResultCopy {
  return COPIES[lang] ?? COPIES.id;
}
