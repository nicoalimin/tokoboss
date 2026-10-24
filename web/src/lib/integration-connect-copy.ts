/**
 * Connect-wizard copy, Bahasa Indonesia first (US20 / RFC 04 task 110a, CoS
 * split of row 110): mockup v2 screen 2 heading + "Khusus Admin" pill, the
 * four step labels, the step-1 picker label, the shared Lanjut / Kembali /
 * Batal buttons, the step 3 / 4 redirect notes and the screen 6 non-Admin
 * notice. Provider sign-in hints and consent scopes stay in
 * integration-consent-copy.ts. Strings never echo tokens or keys.
 */
import type { IntegrationLang } from './integration-copy';

export interface IntegrationConnectCopy {
  title: string;
  adminOnlyBadge: string;
  /** Steps 1–4 in order; the wizard (113) adds the "1 · " prefix. */
  steps: readonly [string, string, string, string];
  pickLabel: string;
  next: string;
  back: string;
  cancel: string;
  /** Step 3: the browser leaves for the provider's own authorize page. */
  redirecting: (provider: string) => string;
  /** Step 4: the provider sent the seller back; the callback verifies. */
  returning: string;
  /** Screen 6; `role` is the display name, e.g. Manager or Staff. */
  nonAdminNotice: (role: string) => string;
}

const id: IntegrationConnectCopy = {
  title: 'Hubungkan toko',
  adminOnlyBadge: 'Khusus Admin',
  steps: [
    'Pilih penyedia',
    'Izin yang diminta',
    'Otorisasi di penyedia',
    'Kembali ke TokoBoss',
  ],
  pickLabel: 'Pilih marketplace',
  next: 'Lanjut',
  back: 'Kembali',
  cancel: 'Batal',
  redirecting: (provider) => `Anda dialihkan ke halaman otorisasi ${provider}…`,
  returning: 'Kembali ke TokoBoss… memverifikasi toko dan izin',
  nonAdminNotice: (role) =>
    `Anda masuk sebagai ${role}. Menghubungkan toko hanya dapat dilakukan Admin.`,
};

const en: IntegrationConnectCopy = {
  title: 'Connect store',
  adminOnlyBadge: 'Admin only',
  steps: [
    'Choose provider',
    'Requested permissions',
    'Authorize at provider',
    'Back to TokoBoss',
  ],
  pickLabel: 'Choose marketplace',
  next: 'Next',
  back: 'Back',
  cancel: 'Cancel',
  redirecting: (provider) =>
    `Redirecting you to the ${provider} authorization page…`,
  returning: 'Back in TokoBoss… verifying the store and permissions',
  nonAdminNotice: (role) =>
    `You are signed in as ${role}. Only an Admin can connect stores.`,
};

const COPIES: Record<IntegrationLang, IntegrationConnectCopy> = { id, en };

export function getIntegrationConnectCopy(
  lang: IntegrationLang = 'id'
): IntegrationConnectCopy {
  return COPIES[lang] ?? COPIES.id;
}
