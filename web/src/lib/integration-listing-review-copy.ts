/**
 * Import review copy, Bahasa Indonesia first (US20 / RFC 04 task 120a, CoS
 * split of row 120): staged listing cards with mapping_state chips and the
 * PII-free recent-order preview (max 50 orders from 7 days). Review only:
 * nothing maps, ignores or syncs (mapping writes are Story 03). Strings
 * never echo tokens, keys, buyer data or other workspaces.
 */
import type { IntegrationListingMappingState } from '@tokoboss/contracts';
import type { IntegrationLang } from './integration-copy';

export interface IntegrationListingReviewCopy {
  listingsHeading: string;
  listingsIntro: string;
  /** Chip label per `mappingState`; the filter adds `filterAll` first. */
  mappingState: Record<IntegrationListingMappingState, string>;
  filterAll: string;
  storeSkuLabel: string;
  /** Provider stock (display only, never TokoBoss stock). */
  stock: (n: number) => string;
  noStoreSku: string;
  candidates: (n: number) => string;
  emptyListings: string;
  emptyFiltered: string;
  loadMore: string;
  loading: string;
  ordersHeading: string;
  ordersNote: string;
  lines: (n: number) => string;
  emptyOrders: string;
  failed: string;
  retry: string;
}

const id: IntegrationListingReviewCopy = {
  listingsHeading: 'Listing diimpor untuk ditinjau',
  listingsIntro:
    'Store SKU dari toko ini belum dipetakan otomatis. Pemetaan ke SKU TokoBoss dilakukan di langkah Petakan Store SKU (Story 03).',
  mappingState: {
    unmapped: 'Belum dipetakan',
    suggested: 'Disarankan',
    ambiguous: 'Ambigu',
    mapped: 'Terpetakan',
    ignored: 'Diabaikan',
  },
  filterAll: 'Semua',
  storeSkuLabel: 'Store SKU',
  stock: (n) => `Stok di toko: ${n}`,
  noStoreSku: 'Tanpa Store SKU',
  candidates: (n) => `${n} kandidat SKU`,
  emptyListings: 'Belum ada listing yang diimpor dari toko ini.',
  emptyFiltered: 'Tidak ada listing dengan status ini.',
  loadMore: 'Muat lagi',
  loading: 'Memuat...',
  ordersHeading: 'Order terbaru diimpor',
  ordersNote:
    'Pratinjau maksimal 50 order dari 7 hari terakhir, tanpa data pembeli.',
  lines: (n) => `${n} item`,
  emptyOrders: 'Belum ada order dalam 7 hari terakhir.',
  failed: 'Gagal memuat hasil impor. Coba lagi.',
  retry: 'Coba lagi',
};

const en: IntegrationListingReviewCopy = {
  listingsHeading: 'Listings imported for review',
  listingsIntro:
    "This store's Store SKUs are not mapped automatically. Map them to TokoBoss SKUs in the Map Store SKUs step (Story 03).",
  mappingState: {
    unmapped: 'Not mapped',
    suggested: 'Suggested',
    ambiguous: 'Ambiguous',
    mapped: 'Mapped',
    ignored: 'Ignored',
  },
  filterAll: 'All',
  storeSkuLabel: 'Store SKU',
  stock: (n) => `Store stock: ${n}`,
  noStoreSku: 'No Store SKU',
  candidates: (n) => (n === 1 ? '1 SKU candidate' : `${n} SKU candidates`),
  emptyListings: 'No listings have been imported from this store yet.',
  emptyFiltered: 'No listings with this status.',
  loadMore: 'Load more',
  loading: 'Loading...',
  ordersHeading: 'Recent orders imported',
  ordersNote:
    'A preview of up to 50 orders from the last 7 days, with no buyer data.',
  lines: (n) => (n === 1 ? '1 item' : `${n} items`),
  emptyOrders: 'No orders in the last 7 days.',
  failed: 'Could not load the import results. Try again.',
  retry: 'Try again',
};

const COPIES: Record<IntegrationLang, IntegrationListingReviewCopy> = {
  id,
  en,
};

export function getIntegrationListingReviewCopy(
  lang: IntegrationLang = 'id'
): IntegrationListingReviewCopy {
  return COPIES[lang] ?? COPIES.id;
}
