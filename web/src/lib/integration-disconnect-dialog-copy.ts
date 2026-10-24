/**
 * Putuskan (Admin disconnect) confirm dialog copy, Bahasa Indonesia first
 * (US20 / RFC 04 task 118a, CoS split of row 118). The dialog (118b) states
 * what Putuskan does: tokens are removed and sync / order import pause, the
 * store's ownership is released (another workspace may connect it), and
 * Store SKU mappings plus order & ledger history are kept. Batal is
 * `cancel` in integration-connect-copy.ts. Strings never echo tokens, keys
 * or other workspaces.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationDisconnectDialogCopy {
  /** `store` is the store name (or provider store ID) and provider. */
  title: (store: string) => string;
  paused: string;
  ownershipReleased: string;
  mappingsKept: string;
  reconnectNote: string;
  confirm: string;
  busy: string;
  failed: string;
}

const id: IntegrationDisconnectDialogCopy = {
  title: (store) => `Putuskan ${store}?`,
  paused:
    'Token akses dihapus. Sinkron stok dan impor order ke toko ini dijeda.',
  ownershipReleased:
    'Kepemilikan toko dilepas: workspace TokoBoss lain dapat menghubungkan toko ini.',
  mappingsKept:
    'Pemetaan Store SKU serta riwayat order & ledger tetap tersimpan di workspace ini.',
  reconnectNote:
    'Hubungkan lagi nanti tanpa memetakan ulang, selama toko belum dihubungkan ke workspace lain.',
  confirm: 'Putuskan',
  busy: 'Memutuskan...',
  failed: 'Gagal memutus toko. Coba lagi.',
};

const en: IntegrationDisconnectDialogCopy = {
  title: (store) => `Disconnect ${store}?`,
  paused:
    'Access tokens are deleted. Inventory sync and order import for this store pause.',
  ownershipReleased:
    'Store ownership is released: another TokoBoss workspace can connect this store.',
  mappingsKept:
    'Store SKU mappings and order & ledger history stay in this workspace.',
  reconnectNote:
    'Reconnect later with no re-mapping, as long as no other workspace has connected the store.',
  confirm: 'Disconnect',
  busy: 'Disconnecting...',
  failed: 'Could not disconnect the store. Try again.',
};

const COPIES: Record<IntegrationLang, IntegrationDisconnectDialogCopy> = {
  id,
  en,
};

export function getIntegrationDisconnectDialogCopy(
  lang: IntegrationLang = 'id'
): IntegrationDisconnectDialogCopy {
  return COPIES[lang] ?? COPIES.id;
}
