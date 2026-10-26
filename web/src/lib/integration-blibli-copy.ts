/**
 * Blibli key form copy, Bahasa Indonesia first (US20 / RFC 04 task 112a,
 * CoS split of row 112): wizard step 3 for Blibli (credential binding, RFC
 * 04 O6) — TokoBoss's API client id, the Seller Center binding steps, the
 * merchant code / API Seller Key / Signature Key fields and the submit
 * button. Used by BlibliKeyForm (112b). Strings never echo keys.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationBlibliCopy {
  title: string;
  intro: string;
  clientIdLabel: string;
  /** Shown when the Blibli client id is not configured for this deploy. */
  clientIdMissing: string;
  stepsHeading: string;
  /** Seller Center binding steps, in order; 112b numbers them. */
  steps: readonly string[];
  merchantCodeLabel: string;
  merchantCodeHint: string;
  apiSellerKeyLabel: string;
  signatureKeyLabel: string;
  /** Keys are validated by one read, sealed and never shown again. */
  keysNote: string;
  missingFields: string;
  submit: string;
  submitting: string;
}

const id: IntegrationBlibliCopy = {
  title: 'Hubungkan dengan API key Blibli',
  intro:
    'Blibli tidak memakai halaman otorisasi. Ikat TokoBoss di Seller Center Blibli, lalu tempel kuncinya di sini.',
  clientIdLabel: 'API client ID TokoBoss',
  clientIdMissing:
    'API client ID Blibli belum tersedia. Hubungi dukungan TokoBoss.',
  stepsHeading: 'Cara mengikat di Seller Center',
  steps: [
    'Masuk ke Seller Center Blibli dengan akun pemilik toko.',
    'Buka pengaturan integrasi API, lalu ikat API client ID TokoBoss di atas.',
    'Salin API Seller Key dan Signature Key yang dibuat Blibli.',
    'Tempel di bawah bersama kode merchant toko, lalu klik Hubungkan Blibli.',
  ],
  merchantCodeLabel: 'Kode merchant',
  merchantCodeHint: 'Contoh: SIJ-60021',
  apiSellerKeyLabel: 'API Seller Key',
  signatureKeyLabel: 'Signature Key',
  keysNote:
    'Kunci hanya dipakai untuk memeriksa toko, lalu disimpan terenkripsi. TokoBoss tidak pernah menampilkannya lagi.',
  missingFields: 'Isi kode merchant, API Seller Key, dan Signature Key.',
  submit: 'Hubungkan Blibli',
  submitting: 'Memeriksa kunci…',
};

const en: IntegrationBlibliCopy = {
  title: 'Connect with a Blibli API key',
  intro:
    'Blibli has no authorization page. Bind TokoBoss in Blibli Seller Center, then paste the keys here.',
  clientIdLabel: 'TokoBoss API client ID',
  clientIdMissing:
    'The Blibli API client ID is not available yet. Contact TokoBoss support.',
  stepsHeading: 'How to bind in Seller Center',
  steps: [
    'Sign in to Blibli Seller Center with the store owner account.',
    'Open the API integration settings and bind the TokoBoss API client ID above.',
    'Copy the API Seller Key and Signature Key that Blibli creates.',
    'Paste them below with the store merchant code, then click Connect Blibli.',
  ],
  merchantCodeLabel: 'Merchant code',
  merchantCodeHint: 'Example: SIJ-60021',
  apiSellerKeyLabel: 'API Seller Key',
  signatureKeyLabel: 'Signature Key',
  keysNote:
    'Keys are only used to check the store, then stored encrypted. TokoBoss never shows them again.',
  missingFields: 'Fill in the merchant code, API Seller Key and Signature Key.',
  submit: 'Connect Blibli',
  submitting: 'Checking keys…',
};

const COPIES: Record<IntegrationLang, IntegrationBlibliCopy> = { id, en };

export function getIntegrationBlibliCopy(
  lang: IntegrationLang = 'id'
): IntegrationBlibliCopy {
  return COPIES[lang] ?? COPIES.id;
}
