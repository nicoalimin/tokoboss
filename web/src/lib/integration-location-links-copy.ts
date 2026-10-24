/**
 * Pilih gudang sumber copy, Bahasa Indonesia first (US20 / RFC 04 task 121j,
 * CoS split of row 121): the store detail next step 2 "Pilih gudang
 * sumber" that links each provider location to the TokoBoss warehouse whose
 * stock it uses. Admin links or clears a link; Manager reads only. Linking
 * never pushes stock (sync is Story 04). Strings never echo tokens, keys or
 * other workspaces.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationLocationLinksCopy {
  heading: string;
  intro: string;
  /** Fallback when the provider location has no name (`name: null`). */
  unnamedLocation: string;
  locationIdLabel: string;
  warehouseLabel: string;
  /** Select option for `warehouseId: null`; choosing it clears the link. */
  notLinked: string;
  linkedCount: (linked: number, total: number) => string;
  emptyLocations: string;
  noWarehouses: string;
  adminOnlyNote: string;
  saving: string;
  saved: string;
  saveFailed: string;
  loading: string;
  failed: string;
  retry: string;
}

const id: IntegrationLocationLinksCopy = {
  heading: 'Pilih gudang sumber',
  intro:
    'Tautkan setiap lokasi toko ke gudang TokoBoss yang stoknya dipakai. Belum ada stok yang didorong ke marketplace.',
  unnamedLocation: 'Lokasi tanpa nama',
  locationIdLabel: 'ID lokasi',
  warehouseLabel: 'Gudang sumber',
  notLinked: 'Belum ditautkan',
  linkedCount: (linked, total) => `${linked} dari ${total} lokasi ditautkan`,
  emptyLocations:
    'Belum ada lokasi dari toko ini. Lokasi muncul setelah impor awal selesai.',
  noWarehouses:
    'Belum ada gudang. Tambahkan gudang di menu Gudang terlebih dahulu.',
  adminOnlyNote: 'Hanya Admin yang dapat mengubah gudang sumber',
  saving: 'Menyimpan...',
  saved: 'Tersimpan',
  saveFailed: 'Gagal menyimpan gudang sumber. Coba lagi.',
  loading: 'Memuat...',
  failed: 'Gagal memuat lokasi toko. Coba lagi.',
  retry: 'Coba lagi',
};

const en: IntegrationLocationLinksCopy = {
  heading: 'Choose source warehouse',
  intro:
    'Link each store location to the TokoBoss warehouse whose stock it uses. No stock has been pushed to the marketplace yet.',
  unnamedLocation: 'Unnamed location',
  locationIdLabel: 'Location ID',
  warehouseLabel: 'Source warehouse',
  notLinked: 'Not linked',
  linkedCount: (linked, total) =>
    total === 1
      ? `${linked} of 1 location linked`
      : `${linked} of ${total} locations linked`,
  emptyLocations:
    'No locations from this store yet. Locations appear once the initial import finishes.',
  noWarehouses: 'No warehouses yet. Add a warehouse under Warehouses first.',
  adminOnlyNote: 'Only an Admin can change the source warehouse',
  saving: 'Saving...',
  saved: 'Saved',
  saveFailed: 'Could not save the source warehouse. Try again.',
  loading: 'Loading...',
  failed: 'Could not load the store locations. Try again.',
  retry: 'Try again',
};

const COPIES: Record<IntegrationLang, IntegrationLocationLinksCopy> = {
  id,
  en,
};

export function getIntegrationLocationLinksCopy(
  lang: IntegrationLang = 'id'
): IntegrationLocationLinksCopy {
  return COPIES[lang] ?? COPIES.id;
}
