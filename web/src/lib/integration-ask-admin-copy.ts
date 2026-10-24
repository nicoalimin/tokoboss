/**
 * Minta Admin copy, Bahasa Indonesia first (US20 / RFC 04 task 105a, CoS
 * Option A): the prefilled request a Manager or Staff copies for an Admin
 * and the copied confirmation. Nothing is sent and no Admin list is fetched
 * in v1. Button label and admin-only note reuse integration-copy.ts.
 */
import { getIntegrationCopy, type IntegrationLang } from './integration-copy';

export interface IntegrationAskAdminCopy {
  button: string;
  adminOnlyNote: string;
  copied: string;
  copyFailed: string;
  /** Only rendered when the parent supplies Admin names (none in v1). */
  adminsLabel: (names: readonly string[]) => string;
  /** `provider` is the display name, e.g. Shopee or TikTok Shop. */
  request: (provider: string) => string;
}

type AskAdminExtra = Omit<IntegrationAskAdminCopy, 'button' | 'adminOnlyNote'>;

const EXTRA: Record<IntegrationLang, AskAdminExtra> = {
  id: {
    copied: '✓ Permintaan disalin',
    copyFailed: 'Tidak dapat menyalin otomatis. Salin teks ini untuk Admin:',
    adminsLabel: (names) => `Admin: ${names.join(', ')}`,
    request: (provider) =>
      `Halo Admin, mohon hubungkan atau otorisasi ulang toko ${provider} kami di TokoBoss (menu Integrasi). Terima kasih.`,
  },
  en: {
    copied: '✓ Request copied',
    copyFailed: "Couldn't copy automatically. Copy this text for an Admin:",
    adminsLabel: (names) => `Admins: ${names.join(', ')}`,
    request: (provider) =>
      `Hi Admin, please connect or reauthorize our ${provider} store in TokoBoss (Integrations). Thank you.`,
  },
};

export function getIntegrationAskAdminCopy(
  lang: IntegrationLang = 'id'
): IntegrationAskAdminCopy {
  const base = getIntegrationCopy(lang);
  return {
    button: base.askAdmin,
    adminOnlyNote: base.adminOnlyNote,
    ...(EXTRA[lang] ?? EXTRA.id),
  };
}
