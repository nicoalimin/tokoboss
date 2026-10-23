/**
 * Problem card copy, Bahasa Indonesia first (US20 / RFC 04 task 100c-i):
 * mockup v2 screen 4, one entry per IntegrationProblemVariant. Never names
 * the owning workspace; no scheduled-retry wording (no crons, 2026-10-23).
 * Screen chrome, chips, Coba lagi and blocked next steps: 100c-ii.
 */
import type { IntegrationLang } from './integration-copy';
import type { IntegrationProblemVariant } from './integration-problem-views';

export interface IntegrationProblemContext {
  provider: string;
  storeName: string;
  storeId: string;
  missingPermissions: readonly string[];
}

export interface IntegrationProblemEntry {
  title: string;
  message: (ctx: IntegrationProblemContext) => string;
}

export interface IntegrationProblemCopy {
  /** PRD 20 neutral blocked-elsewhere headline, verbatim. */
  blockedHeadline: string;
  problems: Record<IntegrationProblemVariant, IntegrationProblemEntry>;
}

const quoted = (names: readonly string[]) =>
  names.map((n) => `“${n}”`).join(', ');

const id: IntegrationProblemCopy = {
  blockedHeadline: 'Toko ini sudah terhubung ke workspace TokoBoss lain',
  problems: {
    cancelled: {
      title: 'Dibatalkan pengguna',
      message: (c) =>
        `Anda membatalkan otorisasi di halaman ${c.provider}. Toko belum terhubung.`,
    },
    token_expired: {
      title: 'Token kedaluwarsa',
      message: (c) =>
        `Otorisasi ${c.provider} “${c.storeName}” (ID ${c.storeId}) kedaluwarsa. Sinkron stok & impor order dijeda; pemetaan tetap tersimpan.`,
    },
    permission_missing: {
      title: 'Izin ditolak / tidak lengkap',
      message: (c) =>
        `Izin ${quoted(c.missingPermissions)} tidak diberikan. Otorisasi ulang dan setujui semua izin yang dibutuhkan.`,
    },
    blocked: {
      title: 'Toko sudah terhubung ke workspace lain',
      message: () =>
        'Satu toko (penyedia + ID toko) hanya dapat terhubung ke satu workspace TokoBoss. Tidak ada data yang diimpor.',
    },
    mismatch: {
      title: 'Toko berbeda saat otorisasi ulang',
      message: () =>
        'Anda masuk ke toko lain dari yang dicatat. Otorisasi ulang harus untuk toko yang sama agar pemetaan tetap valid.',
    },
    unavailable: {
      title: 'Penyedia sedang pemeliharaan / batas laju',
      message: () =>
        'Penyedia tidak merespons. Status tidak ditandai berhasil sebelum terverifikasi; coba lagi beberapa saat lagi.',
    },
  },
};

const en: IntegrationProblemCopy = {
  blockedHeadline:
    'This store is already connected to another TokoBoss workspace',
  problems: {
    cancelled: {
      title: 'Cancelled by user',
      message: (c) =>
        `You cancelled authorization on the ${c.provider} page. The store is not connected.`,
    },
    token_expired: {
      title: 'Token expired',
      message: (c) =>
        `${c.provider} authorization for “${c.storeName}” (ID ${c.storeId}) has expired. Inventory sync & order import are paused; mappings are kept.`,
    },
    permission_missing: {
      title: 'Permission denied / incomplete',
      message: (c) =>
        `Permission ${quoted(c.missingPermissions)} was not granted. Reauthorize and approve every required permission.`,
    },
    blocked: {
      title: 'Store already connected to another workspace',
      message: () =>
        'A store (provider + store ID) can be connected to only one TokoBoss workspace. No data was imported.',
    },
    mismatch: {
      title: 'Different store on reauthorization',
      message: () =>
        'You signed in to a different store than the one on record. Reauthorize the same store so mappings stay valid.',
    },
    unavailable: {
      title: 'Provider maintenance / rate limit',
      message: () =>
        'The provider is not responding. The status is not marked successful until verified; try again in a moment.',
    },
  },
};

const COPIES: Record<IntegrationLang, IntegrationProblemCopy> = { id, en };

export function getIntegrationProblemCopy(
  lang: IntegrationLang = 'id'
): IntegrationProblemCopy {
  return COPIES[lang] ?? COPIES.id;
}
