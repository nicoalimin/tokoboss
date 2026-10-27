/**
 * Petakan Store SKU status copy, Bahasa Indonesia first (UTA-40 / US03,
 * RFC 05 row 30b): pre-sync stock conflict, listing lifecycle pills,
 * mapping history actions and slot actions (RFC §3, Edge Cases 2 and 4).
 * Page/card copy: sku-mapping-copy.ts (30a). Keys stay in sync per locale.
 */
import type {
  SkuMappingAction,
  SkuMappingLifecycleIssue,
} from '@tokoboss/contracts';
import type { SkuMappingLang } from './sku-mapping-copy';

export interface SkuMappingStatusCopy {
  conflict: (store: number, tokoboss: number) => string;
  stockPair: (store: number, tokoboss: number) => string;
  syncOff: string;
  lifecycle: Record<SkuMappingLifecycleIssue, string>;
  following: string;
  action: Record<SkuMappingAction, string>;
  historyTitle: string;
  historyEmpty: string;
  reviewAmbiguous: string;
  unmap: string;
  noStores: string;
  readOnly: string;
}

const id: SkuMappingStatusCopy = {
  conflict: (s, t) => `Konflik stok: Toko ${s} vs TokoBoss ${t}`,
  stockPair: (s, t) => `Stok toko: ${s} · Stok TokoBoss: ${t}`,
  syncOff: 'Sinkron stok keluar masih Mati sampai diaktifkan.',
  lifecycle: {
    listing_missing: 'Listing tidak ada di toko',
    listing_deleted: 'Listing dihapus di toko',
    listing_paused: 'Listing dijeda di toko',
    listing_inactive: 'Listing nonaktif di toko',
    connection_disconnected: 'Koneksi diarsipkan',
    title_renamed: 'Judul berubah di toko',
  },
  following: 'Mengikuti',
  action: {
    mapped: 'Dipetakan',
    remapped: 'Dipetakan ulang',
    unmapped: 'Pemetaan dilepas',
    bulk_mapped: 'Dipetakan otomatis',
    restored: 'Dipulihkan',
  },
  historyTitle: 'Riwayat pemetaan',
  historyEmpty: 'Belum ada perubahan pemetaan.',
  reviewAmbiguous: 'Tinjau kecocokan ambigu',
  unmap: 'Lepas pemetaan',
  noStores: 'Hubungkan toko Shopee, TikTok Shop, atau Blibli terlebih dahulu.',
  readOnly: 'Anda bisa melihat pemetaan. Mengubahnya butuh Manager atau Admin.',
};

const en: SkuMappingStatusCopy = {
  conflict: (s, t) => `Stock conflict: store ${s} vs TokoBoss ${t}`,
  stockPair: (s, t) => `Store stock: ${s} · TokoBoss stock: ${t}`,
  syncOff: 'Outbound stock sync stays Off until it is enabled.',
  lifecycle: {
    listing_missing: 'Listing missing from store',
    listing_deleted: 'Listing deleted in store',
    listing_paused: 'Listing paused in store',
    listing_inactive: 'Listing inactive in store',
    connection_disconnected: 'Connection archived',
    title_renamed: 'Title changed in store',
  },
  following: 'Following',
  action: {
    mapped: 'Mapped',
    remapped: 'Remapped',
    unmapped: 'Unmapped',
    bulk_mapped: 'Auto-mapped',
    restored: 'Restored',
  },
  historyTitle: 'Mapping history',
  historyEmpty: 'No mapping changes yet.',
  reviewAmbiguous: 'Review ambiguous match',
  unmap: 'Unmap',
  noStores: 'Connect a Shopee, TikTok Shop or Blibli store first.',
  readOnly: 'You can view mappings. Changing them needs Manager or Admin.',
};

const COPIES: Record<SkuMappingLang, SkuMappingStatusCopy> = { id, en };

export function getSkuMappingStatusCopy(
  lang: SkuMappingLang = 'id'
): SkuMappingStatusCopy {
  return COPIES[lang] ?? COPIES.id;
}
