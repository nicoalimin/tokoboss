import Link from 'next/link';
import { SettingsHub } from '@/components/settings/SettingsHub';
import { RoleCards } from '@/components/settings/RoleCards';
import { PermissionMatrix } from '@/components/settings/PermissionMatrix';
import { getSettingsCopy } from '@/lib/settings-copy';

export const metadata = { title: 'Pengaturan — TokoBoss' };

/**
 * Settings hub (UTA-74, Story 23 — Pengaturan).
 *
 * Entry via the bottom-left ellipsis / Lainnya menu (`AppNav`, global).
 * Profil + Tim & Akses rows link to working screens; Gudang, Integrasi,
 * Bahasa, Notifikasi, and Paket & Tagihan are honest coming-soon stubs
 * owned by later stories. Role cards + permission matrix render below the
 * row list so every role sees the same contract the server enforces.
 */
export default function PengaturanPage() {
  const copy = getSettingsCopy('en');
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="settings-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="settings-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.settingsTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            {copy.settingsSubtitle}
          </p>
          <SettingsHub />
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
            <RoleCards />
          </div>
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
            <PermissionMatrix />
          </div>
          <p className="mt-6 text-center text-sm">
            <Link
              href="/"
              className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
            >
              Back to home
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
