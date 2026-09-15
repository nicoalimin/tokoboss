/**
 * Web auth UI copy (UTA-69).
 *
 * English + Indonesian strings for Story 21 screens. Keys must stay in sync
 * across locales (see `web/src/__tests__/auth-ui.test.ts`).
 *
 * Copy rules (UTA-17 freeze):
 * - Idle-only sessions: describe sign-out after *inactivity*, never an
 *   absolute "valid for N minutes / expires at T" message.
 * - Failures are generic: sign-in and reset-request never reveal whether an
 *   email exists.
 */

export type AuthLang = 'en' | 'id';

export interface AuthCopy {
  signInTitle: string;
  signInSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  workspaceLabel: string;
  workspaceHint: string;
  workspacePlaceholder: string;
  signInButton: string;
  signingIn: string;
  forgotPasswordLink: string;
  backToSignInLink: string;
  genericSignInError: string;
  rateLimitedError: string;
  validationError: string;
  expiredNotice: string;
  signedOutNotice: string;
  forgotTitle: string;
  forgotSubtitle: string;
  forgotButton: string;
  forgotSending: string;
  forgotDone: string;
  resetTitle: string;
  resetSubtitle: string;
  newPasswordLabel: string;
  resetButton: string;
  resetting: string;
  resetDone: string;
  sessionsTitle: string;
  sessionsSubtitle: string;
  sessionsLoading: string;
  sessionsEmpty: string;
  signOutThis: string;
  signOutAll: string;
  signingOut: string;
  securityTitle: string;
  securityBody: string;
  currentDevice: string;
}

const en: AuthCopy = {
  signInTitle: 'Sign in to TokoBoss',
  signInSubtitle: 'Use your work email and password.',
  emailLabel: 'Email',
  emailPlaceholder: 'owner@toko.id',
  passwordLabel: 'Password',
  workspaceLabel: 'Workspace ID',
  workspaceHint: 'Ask your admin for the workspace ID. It is case-sensitive.',
  workspacePlaceholder: 'ws_…',
  signInButton: 'Sign in',
  signingIn: 'Signing in…',
  forgotPasswordLink: 'Forgot password?',
  backToSignInLink: 'Back to sign in',
  genericSignInError: 'Invalid email or password.',
  rateLimitedError: 'Too many attempts. Try again later.',
  validationError: 'Check the highlighted fields and try again.',
  expiredNotice: 'Your session ended. Sign in again to continue.',
  signedOutNotice: 'You are signed out.',
  forgotTitle: 'Recover access',
  forgotSubtitle: 'Enter your email. If it exists, a reset ticket is created.',
  forgotButton: 'Send reset link',
  forgotSending: 'Sending…',
  forgotDone: 'If the email exists, a reset ticket was created.',
  resetTitle: 'Choose a new password',
  resetSubtitle: 'Minimum 8 characters. Avoid common passwords.',
  newPasswordLabel: 'New password',
  resetButton: 'Reset password',
  resetting: 'Resetting…',
  resetDone: 'Password updated. Sign in with your new password.',
  sessionsTitle: 'Active sessions',
  sessionsSubtitle:
    'Devices signed in to your account. Inactive devices are signed out automatically.',
  sessionsLoading: 'Loading sessions…',
  sessionsEmpty: 'No other active sessions.',
  signOutThis: 'Sign out this device',
  signOutAll: 'Sign out all devices',
  signingOut: 'Signing out…',
  securityTitle: 'Recent security activity',
  securityBody:
    'Successful and failed sign-ins, password resets, and forced sign-outs are recorded for your workspace. Contact your admin if you see a device you do not recognize.',
  currentDevice: 'This device',
};

const id: AuthCopy = {
  signInTitle: 'Masuk ke TokoBoss',
  signInSubtitle: 'Gunakan email kerja dan kata sandi Anda.',
  emailLabel: 'Email',
  emailPlaceholder: 'owner@toko.id',
  passwordLabel: 'Kata sandi',
  workspaceLabel: 'ID Workspace',
  workspaceHint: 'Minta ID workspace ke admin. Huruf besar/kecil berpengaruh.',
  workspacePlaceholder: 'ws_…',
  signInButton: 'Masuk',
  signingIn: 'Memproses…',
  forgotPasswordLink: 'Lupa kata sandi?',
  backToSignInLink: 'Kembali masuk',
  genericSignInError: 'Email atau kata sandi salah.',
  rateLimitedError: 'Terlalu banyak percobaan. Coba lagi nanti.',
  validationError: 'Periksa kolom yang ditandai lalu coba lagi.',
  expiredNotice: 'Sesi Anda berakhir. Masuk kembali untuk lanjut.',
  signedOutNotice: 'Anda sudah keluar.',
  forgotTitle: 'Pulihkan akses',
  forgotSubtitle: 'Masukkan email Anda. Jika terdaftar, tiket reset dibuat.',
  forgotButton: 'Kirim tautan reset',
  forgotSending: 'Mengirim…',
  forgotDone: 'Jika email terdaftar, tiket reset telah dibuat.',
  resetTitle: 'Pilih kata sandi baru',
  resetSubtitle: 'Minimal 8 karakter. Hindari kata sandi umum.',
  newPasswordLabel: 'Kata sandi baru',
  resetButton: 'Atur ulang kata sandi',
  resetting: 'Memproses…',
  resetDone: 'Kata sandi diperbarui. Masuk dengan kata sandi baru.',
  sessionsTitle: 'Sesi aktif',
  sessionsSubtitle:
    'Perangkat yang masuk ke akun Anda. Perangkat yang tidak aktif akan keluar otomatis.',
  sessionsLoading: 'Memuat sesi…',
  sessionsEmpty: 'Tidak ada sesi aktif lain.',
  signOutThis: 'Keluar dari perangkat ini',
  signOutAll: 'Keluar dari semua perangkat',
  signingOut: 'Keluar…',
  securityTitle: 'Aktivitas keamanan terkini',
  securityBody:
    'Upaya masuk yang berhasil maupun gagal, reset kata sandi, dan pengeluaran paksa tercatat untuk workspace Anda. Hubungi admin jika ada perangkat yang tidak dikenal.',
  currentDevice: 'Perangkat ini',
};

const COPIES: Record<AuthLang, AuthCopy> = { en, id };

export function getAuthCopy(lang: AuthLang = 'en'): AuthCopy {
  return COPIES[lang] ?? COPIES.en;
}

export function authCopyKeys(): Array<keyof AuthCopy> {
  return Object.keys(en) as Array<keyof AuthCopy>;
}
