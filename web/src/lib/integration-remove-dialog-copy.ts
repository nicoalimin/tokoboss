/**
 * Hapus koneksi (Admin remove, from Terputus only) confirm dialog copy,
 * Bahasa Indonesia first (US20 / RFC 04 task 119a, CoS split of row 119).
 * The dialog (119b) states what Hapus koneksi does: the connection is
 * removed (the store shows as Belum terhubung), Store SKU mappings are
 * archived, the store's ownership is released (another workspace may
 * connect it) and order & ledger history is kept. Batal is `cancel` in
 * integration-connect-copy.ts. Strings never echo tokens, keys or other
 * workspaces.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationRemoveDialogCopy {
  /** `store` is the store name (or provider store ID) and provider. */
  title: (store: string) => string;
  removed: string;
  mappingsArchived: string;
  ownershipReleased: string;
  historyKept: string;
  reconnectNote: string;
  confirm: string;
  busy: string;
  failed: string;
}

const id: IntegrationRemoveDialogCopy = {
  title: (store) => `Hapus koneksi ${store}?`,
  removed:
    'Koneksi dihapus: toko tampil sebagai Belum terhubung di Pusat integrasi.',
  mappingsArchived:
    'Pemetaan Store SKU toko ini diarsipkan dan tidak dipakai untuk sinkron.',
  ownershipReleased:
    'Kepemilikan toko dilepas: workspace TokoBoss lain dapat menghubungkan toko ini.',
  historyKept: 'Riwayat order & ledger tetap tersimpan di workspace ini.',
  reconnectNote:
    'Jika toko yang sama dihubungkan lagi ke workspace ini, pemetaan dipulihkan dari arsip, selama toko belum dihubungkan ke workspace lain.',
  confirm: 'Hapus koneksi',
  busy: 'Menghapus...',
  failed: 'Gagal menghapus koneksi. Coba lagi.',
};

const en: IntegrationRemoveDialogCopy = {
  title: (store) => `Remove the ${store} connection?`,
  removed:
    'The connection is removed: the store shows as Not connected in the Integration center.',
  mappingsArchived:
    "This store's Store SKU mappings are archived and no longer used for sync.",
  ownershipReleased:
    'Store ownership is released: another TokoBoss workspace can connect this store.',
  historyKept: 'Order & ledger history stays in this workspace.',
  reconnectNote:
    'If the same store is connected to this workspace again, mappings are restored from the archive, as long as no other workspace has connected the store.',
  confirm: 'Remove connection',
  busy: 'Removing...',
  failed: 'Could not remove the connection. Try again.',
};

const COPIES: Record<IntegrationLang, IntegrationRemoveDialogCopy> = {
  id,
  en,
};

export function getIntegrationRemoveDialogCopy(
  lang: IntegrationLang = 'id'
): IntegrationRemoveDialogCopy {
  return COPIES[lang] ?? COPIES.id;
}
