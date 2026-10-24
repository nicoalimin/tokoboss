/**
 * Disconnected (Terputus) panel copy, Bahasa Indonesia first (US20 / RFC 04
 * task 117a, CoS split of row 117): mockup v2 screen 5 source line, detected
 * time, impact table, cause + reconnect note and the two Admin actions. The
 * Terputus pill is status.disconnected and Minta Admin is askAdmin in
 * integration-copy.ts. Strings never echo tokens, keys or other workspaces.
 */
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import type { IntegrationLang } from './integration-copy';

/** admin | seller | provider (the wire `disconnectSource`, non-null). */
export type IntegrationDisconnectSource = NonNullable<
  IntegrationConnectionView['disconnectSource']
>;

export interface IntegrationDisconnectedCopy {
  source: Record<IntegrationDisconnectSource, string>;
  sourceUnknown: string;
  detected: (time: string) => string;
  impactLabel: string;
  statusLabel: string;
  syncRow: string;
  ordersRow: string;
  mappingsRow: string;
  historyRow: string;
  paused: string;
  kept: string;
  otherCauses: Record<IntegrationDisconnectSource, string>;
  reconnectNote: string;
  reconnect: string;
  remove: string;
}

const id: IntegrationDisconnectedCopy = {
  source: {
    seller: 'Diputus dari sisi penjual (di aplikasi penyedia)',
    provider: 'Toko dinonaktifkan oleh penyedia',
    admin: 'Diputus oleh Admin dari TokoBoss',
  },
  sourceUnknown: 'Koneksi terputus',
  detected: (time) => `terdeteksi ${time}`,
  impactLabel: 'Dampak',
  statusLabel: 'Status',
  syncRow: 'Sinkron stok ke toko ini',
  ordersRow: 'Impor order baru',
  mappingsRow: 'Pemetaan Store SKU',
  historyRow: 'Riwayat order & ledger',
  paused: 'Dijeda',
  kept: 'Tetap tersimpan',
  otherCauses: {
    seller:
      'Penyebab lain: toko dinonaktifkan oleh penyedia, atau Admin memutus dari TokoBoss.',
    provider:
      'Penyebab lain: penjual memutus di aplikasi penyedia, atau Admin memutus dari TokoBoss.',
    admin:
      'Penyebab lain: penjual memutus di aplikasi penyedia, atau toko dinonaktifkan oleh penyedia.',
  },
  reconnectNote:
    'Saat dihubungkan lagi ke toko yang sama, pemetaan langsung dipakai kembali tanpa memetakan ulang.',
  reconnect: 'Hubungkan lagi',
  remove: 'Hapus koneksi (pemetaan diarsipkan)',
};

const en: IntegrationDisconnectedCopy = {
  source: {
    seller: 'Disconnected by the seller (in the provider app)',
    provider: 'Store disabled by the provider',
    admin: 'Disconnected by an Admin in TokoBoss',
  },
  sourceUnknown: 'Connection lost',
  detected: (time) => `detected ${time}`,
  impactLabel: 'Impact',
  statusLabel: 'Status',
  syncRow: 'Inventory sync to this store',
  ordersRow: 'New order import',
  mappingsRow: 'Store SKU mappings',
  historyRow: 'Order & ledger history',
  paused: 'Paused',
  kept: 'Kept',
  otherCauses: {
    seller:
      'Other causes: the provider disabled the store, or an Admin disconnected it in TokoBoss.',
    provider:
      'Other causes: the seller disconnected in the provider app, or an Admin disconnected it in TokoBoss.',
    admin:
      'Other causes: the seller disconnected in the provider app, or the provider disabled the store.',
  },
  reconnectNote:
    'When reconnected to the same store, mappings are reused right away with no re-mapping.',
  reconnect: 'Reconnect',
  remove: 'Remove connection (mappings archived)',
};

const COPIES: Record<IntegrationLang, IntegrationDisconnectedCopy> = { id, en };

export function getIntegrationDisconnectedCopy(
  lang: IntegrationLang = 'id'
): IntegrationDisconnectedCopy {
  return COPIES[lang] ?? COPIES.id;
}
