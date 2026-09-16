/**
 * Settings hub (Pengaturan) UI copy (UTA-74, Story 23).
 *
 * English + Indonesian strings for the Settings hub, role cards, permission
 * matrix, and no-access states. Keys must stay in sync across locales (see
 * `web/src/__tests__/settings-hub.test.ts`).
 *
 * Copy rules (UTA-17 freeze):
 * - Idle-only sessions: re-auth wording describes the session ending, never
 *   an absolute "valid for N minutes" message.
 * - Failures are generic: no workspace ids, emails, or scope values echo.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names.
 */

export type SettingsLang = 'en' | 'id';

export type SettingsAreaSlug =
  | 'profil'
  | 'tim'
  | 'gudang'
  | 'integrasi'
  | 'bahasa'
  | 'notifikasi'
  | 'tagihan';

export interface SettingsRowDef {
  slug: SettingsAreaSlug;
  href: string;
  /** True when the row links to a working screen (others are stubs). */
  live: boolean;
  /** True when the row is Admin-gated (manage controls hide for others). */
  adminOnly: boolean;
}

export const SETTINGS_ROWS: SettingsRowDef[] = [
  { slug: 'profil', href: '/profil', live: true, adminOnly: false },
  { slug: 'tim', href: '/team', live: true, adminOnly: true },
  { slug: 'gudang', href: '/pengaturan/gudang', live: false, adminOnly: false },
  {
    slug: 'integrasi',
    href: '/pengaturan/integrasi',
    live: false,
    adminOnly: false,
  },
  { slug: 'bahasa', href: '/pengaturan/bahasa', live: false, adminOnly: false },
  {
    slug: 'notifikasi',
    href: '/pengaturan/notifikasi',
    live: false,
    adminOnly: false,
  },
  {
    slug: 'tagihan',
    href: '/pengaturan/tagihan',
    live: false,
    adminOnly: true,
  },
];

export interface SettingsCopy {
  settingsTitle: string;
  settingsSubtitle: string;
  rowProfil: string;
  rowProfilHint: string;
  rowTim: string;
  rowTimHint: string;
  rowGudang: string;
  rowGudangHint: string;
  rowIntegrasi: string;
  rowIntegrasiHint: string;
  rowBahasa: string;
  rowBahasaHint: string;
  rowNotifikasi: string;
  rowNotifikasiHint: string;
  rowTagihan: string;
  rowTagihanHint: string;
  comingSoon: string;
  stubTitle: string;
  stubBody: string;
  backToSettingsLink: string;
  adminOnlyBadge: string;
  lockedForRole: string;
  noAccessTitle: string;
  noAccessBody: string;
  noAccessSignInLink: string;
  rolesTitle: string;
  rolesSubtitle: string;
  roleAdmin: string;
  roleAdminBody: string;
  roleManager: string;
  roleManagerBody: string;
  roleStaff: string;
  roleStaffBody: string;
  matrixTitle: string;
  matrixSubtitle: string;
  matrixNote: string;
  accessFull: string;
  accessScoped: string;
  accessView: string;
  accessNone: string;
  capDashboard: string;
  capProducts: string;
  capOrders: string;
  capPurchasing: string;
  capIntegrations: string;
  capTeam: string;
  capBilling: string;
  navSettings: string;
}

const en: SettingsCopy = {
  settingsTitle: 'Pengaturan',
  settingsSubtitle:
    'Workspace settings. Profil and Tim & Akses are live; other rows are coming soon.',
  rowProfil: 'Profil',
  rowProfilHint: 'Your display name, avatar, and password.',
  rowTim: 'Tim & Akses',
  rowTimHint: 'Roles, warehouse scope, and the permission matrix.',
  rowGudang: 'Gudang',
  rowGudangHint: 'Warehouses live here in a later story.',
  rowIntegrasi: 'Integrasi',
  rowIntegrasiHint: 'Marketplace and courier connections, later.',
  rowBahasa: 'Bahasa',
  rowBahasaHint: 'Language preference, later.',
  rowNotifikasi: 'Notifikasi',
  rowNotifikasiHint: 'Notification preferences, later.',
  rowTagihan: 'Paket & Tagihan',
  rowTagihanHint: 'Plan and billing. Admin only, later.',
  comingSoon: 'Coming soon',
  stubTitle: 'Not available yet',
  stubBody:
    'This settings area is not part of this release. Profil and Tim & Akses work today.',
  backToSettingsLink: 'Back to Pengaturan',
  adminOnlyBadge: 'Admin only',
  lockedForRole:
    'Your role can view this area but cannot change it. Contact your admin.',
  noAccessTitle: 'No access',
  noAccessBody:
    'Your role does not include this area. The page stays hidden and the server still enforces access.',
  noAccessSignInLink: 'Sign in again',
  rolesTitle: 'Roles',
  rolesSubtitle: 'Three fixed roles. Admins are never warehouse-scoped.',
  roleAdmin: 'Admin — full access',
  roleAdminBody: 'Every warehouse, every area, including team and billing.',
  roleManager: 'Manager — scoped warehouse',
  roleManagerBody: 'Manages daily work inside an assigned warehouse scope.',
  roleStaff: 'Staff — scoped warehouse',
  roleStaffBody: 'Runs assigned tasks inside an assigned warehouse scope.',
  matrixTitle: 'Permission matrix',
  matrixSubtitle: 'What each role may do. The server enforces every row.',
  matrixNote:
    'Scoped means inside the assigned warehouse only. Admins always cover every warehouse.',
  accessFull: 'Full',
  accessScoped: 'Scoped',
  accessView: 'View',
  accessNone: '—',
  capDashboard: 'Dashboard / reports',
  capProducts: 'Products / SKU / stock',
  capOrders: 'Orders / fulfillment',
  capPurchasing: 'Purchasing / HPP',
  capIntegrations: 'Integrations',
  capTeam: 'Team / RBAC',
  capBilling: 'Billing',
  navSettings: 'Pengaturan',
};

const id: SettingsCopy = {
  settingsTitle: 'Pengaturan',
  settingsSubtitle:
    'Pengaturan workspace. Profil dan Tim & Akses sudah live; baris lain segera hadir.',
  rowProfil: 'Profil',
  rowProfilHint: 'Nama tampilan, avatar, dan kata sandi Anda.',
  rowTim: 'Tim & Akses',
  rowTimHint: 'Peran, cakupan gudang, dan matriks izin.',
  rowGudang: 'Gudang',
  rowGudangHint: 'Gudang hadir di story berikutnya.',
  rowIntegrasi: 'Integrasi',
  rowIntegrasiHint: 'Koneksi marketplace dan kurir, menyusul.',
  rowBahasa: 'Bahasa',
  rowBahasaHint: 'Preferensi bahasa, menyusul.',
  rowNotifikasi: 'Notifikasi',
  rowNotifikasiHint: 'Preferensi notifikasi, menyusul.',
  rowTagihan: 'Paket & Tagihan',
  rowTagihanHint: 'Paket dan tagihan. Khusus Admin, menyusul.',
  comingSoon: 'Segera hadir',
  stubTitle: 'Belum tersedia',
  stubBody:
    'Area pengaturan ini belum termasuk rilis ini. Profil dan Tim & Akses sudah bisa dipakai.',
  backToSettingsLink: 'Kembali ke Pengaturan',
  adminOnlyBadge: 'Khusus Admin',
  lockedForRole:
    'Peran Anda bisa melihat area ini tetapi tidak bisa mengubahnya. Hubungi admin.',
  noAccessTitle: 'Tidak ada akses',
  noAccessBody:
    'Peran Anda tidak mencakup area ini. Halaman tetap disembunyikan dan server tetap menegakkan akses.',
  noAccessSignInLink: 'Masuk kembali',
  rolesTitle: 'Peran',
  rolesSubtitle: 'Tiga peran tetap. Admin tidak pernah dibatasi gudang.',
  roleAdmin: 'Admin — akses penuh',
  roleAdminBody: 'Semua gudang, semua area, termasuk tim dan tagihan.',
  roleManager: 'Manajer — cakupan gudang',
  roleManagerBody: 'Mengelola pekerjaan harian dalam cakupan gudang.',
  roleStaff: 'Staf — cakupan gudang',
  roleStaffBody: 'Menjalankan tugas dalam cakupan gudang yang ditetapkan.',
  matrixTitle: 'Matriks izin',
  matrixSubtitle:
    'Hal yang boleh dilakukan tiap peran. Server menegakkan tiap baris.',
  matrixNote:
    'Tercakup berarti hanya dalam gudang yang ditetapkan. Admin selalu mencakup semua gudang.',
  accessFull: 'Penuh',
  accessScoped: 'Tercakup',
  accessView: 'Lihat',
  accessNone: '—',
  capDashboard: 'Dasbor / laporan',
  capProducts: 'Produk / SKU / stok',
  capOrders: 'Pesanan / pemenuhan',
  capPurchasing: 'Pembelian / HPP',
  capIntegrations: 'Integrasi',
  capTeam: 'Tim / RBAC',
  capBilling: 'Tagihan',
  navSettings: 'Pengaturan',
};

const COPIES: Record<SettingsLang, SettingsCopy> = { en, id };

export function getSettingsCopy(lang: SettingsLang = 'en'): SettingsCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function settingsCopyKeys(): Array<keyof SettingsCopy> {
  return Object.keys(en) as Array<keyof SettingsCopy>;
}

/** Row label + hint for a slug (never echoes ids or scopes). */
export function rowCopy(
  copy: SettingsCopy,
  slug: SettingsAreaSlug
): { label: string; hint: string } {
  switch (slug) {
    case 'profil':
      return { label: copy.rowProfil, hint: copy.rowProfilHint };
    case 'tim':
      return { label: copy.rowTim, hint: copy.rowTimHint };
    case 'gudang':
      return { label: copy.rowGudang, hint: copy.rowGudangHint };
    case 'integrasi':
      return { label: copy.rowIntegrasi, hint: copy.rowIntegrasiHint };
    case 'bahasa':
      return { label: copy.rowBahasa, hint: copy.rowBahasaHint };
    case 'notifikasi':
      return { label: copy.rowNotifikasi, hint: copy.rowNotifikasiHint };
    case 'tagihan':
      return { label: copy.rowTagihan, hint: copy.rowTagihanHint };
  }
}
