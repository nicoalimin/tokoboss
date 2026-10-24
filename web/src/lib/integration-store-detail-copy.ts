/**
 * Store detail page copy, Bahasa Indonesia first (US20 / RFC 04 task 122b,
 * CoS split of row 122): the Pusat integrasi breadcrumb, loading and retry,
 * the not-found state (unknown or removed store, never hints at another
 * workspace), the back link and the Admin Putuskan toko button. Screen
 * bodies use their own copy files (result, problem, disconnected, dialogs).
 * Strings never echo tokens, keys or other workspaces.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationStoreDetailCopy {
  centerLink: string;
  loading: string;
  retry: string;
  notFoundTitle: string;
  notFoundBody: string;
  backToCenter: string;
  /** Admin only; opens the Putuskan confirm dialog (118b). */
  disconnect: string;
}

const id: IntegrationStoreDetailCopy = {
  centerLink: 'Pusat integrasi',
  loading: 'Memuat toko...',
  retry: 'Coba lagi',
  notFoundTitle: 'Toko tidak ditemukan',
  notFoundBody:
    'Toko ini tidak ada di workspace ini atau koneksinya sudah dihapus.',
  backToCenter: 'Kembali ke Pusat integrasi',
  disconnect: 'Putuskan toko',
};

const en: IntegrationStoreDetailCopy = {
  centerLink: 'Integration center',
  loading: 'Loading store...',
  retry: 'Try again',
  notFoundTitle: 'Store not found',
  notFoundBody:
    'This store is not in this workspace or its connection was removed.',
  backToCenter: 'Back to Integration center',
  disconnect: 'Disconnect store',
};

const COPIES: Record<IntegrationLang, IntegrationStoreDetailCopy> = {
  id,
  en,
};

export function getIntegrationStoreDetailCopy(
  lang: IntegrationLang = 'id'
): IntegrationStoreDetailCopy {
  return COPIES[lang] ?? COPIES.id;
}
