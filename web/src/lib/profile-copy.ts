/**
 * Web Profil UI copy (UTA-73, Story 25).
 *
 * English + Indonesian strings for the personal-profile screens. Keys must
 * stay in sync across locales (see `web/src/__tests__/profile-ui.test.ts`).
 *
 * Copy rules (UTA-17 freeze + UTA-72 API):
 * - Idle-only sessions: re-auth wording describes the session ending, never
 *   an absolute "valid for N minutes" message.
 * - Failures are generic where the API is: wrong current password shares one
 *   message shape (no oracle beyond "check and try again"); strings never
 *   echo emails, passwords, or ticket material.
 * - No secrets in copy: strings never mention hashes, bearer tokens, or
 *   cookie names.
 */

export type ProfileLang = 'en' | 'id';

export interface ProfileCopy {
  profileTitle: string;
  profileSubtitle: string;
  profileLoading: string;
  emailLabel: string;
  displayNameLabel: string;
  displayNamePlaceholder: string;
  avatarLabel: string;
  avatarHint: string;
  avatarPlaceholder: string;
  saveButton: string;
  saving: string;
  profileUpdated: string;
  validationError: string;
  mismatchError: string;
  genericError: string;
  forbiddenError: string;
  expiredNotice: string;
  passwordTitle: string;
  passwordSubtitle: string;
  currentPasswordLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  newPasswordHint: string;
  changeButton: string;
  changing: string;
  passwordDone: string;
  passwordReauthNote: string;
  sessionsTitle: string;
  sessionsHint: string;
  viewSessionsLink: string;
  navMenuLabel: string;
  navMoreLabel: string;
  navProfile: string;
  navSessions: string;
  navTeam: string;
  navSignIn: string;
  backHomeLink: string;
}

const en: ProfileCopy = {
  profileTitle: 'Profil',
  profileSubtitle: 'Your display name and avatar. Changes apply immediately.',
  profileLoading: 'Loading profile…',
  emailLabel: 'Email',
  displayNameLabel: 'Display name',
  displayNamePlaceholder: 'Budi Santoso',
  avatarLabel: 'Avatar upload ID (optional)',
  avatarHint:
    'Paste a completed avatar upload ID from this workspace. Never a URL or file bytes.',
  avatarPlaceholder: 'upl_…',
  saveButton: 'Save profile',
  saving: 'Saving…',
  profileUpdated: 'Profile updated.',
  validationError: 'Check the highlighted fields and try again.',
  mismatchError: 'New passwords do not match.',
  genericError: 'Something went wrong. Try again.',
  forbiddenError: 'You do not have access to this profile.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
  passwordTitle: 'Change password',
  passwordSubtitle: 'Minimum 8 characters. Avoid common passwords.',
  currentPasswordLabel: 'Current password',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm new password',
  newPasswordHint: 'Minimum 8 characters. You will sign in again after.',
  changeButton: 'Change password',
  changing: 'Changing…',
  passwordDone: 'Password changed.',
  passwordReauthNote: 'All sessions ended. Sign in with your new password.',
  sessionsTitle: 'Active sessions',
  sessionsHint: 'Devices signed in to your account live below.',
  viewSessionsLink: 'Open full sessions screen',
  navMenuLabel: 'More menu',
  navMoreLabel: 'Lainnya',
  navProfile: 'Profil',
  navSessions: 'Active sessions',
  navTeam: 'Team & Access',
  navSignIn: 'Sign in',
  backHomeLink: 'Back to home',
};

const id: ProfileCopy = {
  profileTitle: 'Profil',
  profileSubtitle: 'Nama tampilan dan avatar Anda. Perubahan berlaku segera.',
  profileLoading: 'Memuat profil…',
  emailLabel: 'Email',
  displayNameLabel: 'Nama tampilan',
  displayNamePlaceholder: 'Budi Santoso',
  avatarLabel: 'ID unggahan avatar (opsional)',
  avatarHint:
    'Tempel ID unggahan avatar yang sudah selesai dari workspace ini. Bukan URL atau isi berkas.',
  avatarPlaceholder: 'upl_…',
  saveButton: 'Simpan profil',
  saving: 'Menyimpan…',
  profileUpdated: 'Profil diperbarui.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  mismatchError: 'Konfirmasi kata sandi baru tidak cocok.',
  genericError: 'Terjadi kesalahan. Coba lagi.',
  forbiddenError: 'Anda tidak punya akses ke profil ini.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
  passwordTitle: 'Ganti kata sandi',
  passwordSubtitle: 'Minimal 8 karakter. Hindari kata sandi umum.',
  currentPasswordLabel: 'Kata sandi saat ini',
  newPasswordLabel: 'Kata sandi baru',
  confirmPasswordLabel: 'Konfirmasi kata sandi baru',
  newPasswordHint: 'Minimal 8 karakter. Anda akan masuk lagi setelahnya.',
  changeButton: 'Ganti kata sandi',
  changing: 'Memproses…',
  passwordDone: 'Kata sandi diganti.',
  passwordReauthNote: 'Semua sesi berakhir. Masuk dengan kata sandi baru.',
  sessionsTitle: 'Sesi aktif',
  sessionsHint: 'Perangkat yang masuk ke akun Anda tampil di bawah.',
  viewSessionsLink: 'Buka layar sesi lengkap',
  navMenuLabel: 'Menu lainnya',
  navMoreLabel: 'Lainnya',
  navProfile: 'Profil',
  navSessions: 'Sesi aktif',
  navTeam: 'Tim & Akses',
  navSignIn: 'Masuk',
  backHomeLink: 'Kembali ke beranda',
};

const COPIES: Record<ProfileLang, ProfileCopy> = { en, id };

export function getProfileCopy(lang: ProfileLang = 'en'): ProfileCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function profileCopyKeys(): Array<keyof ProfileCopy> {
  return Object.keys(en) as Array<keyof ProfileCopy>;
}
