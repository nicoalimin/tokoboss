'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMembership } from '@/lib/use-membership';
import { ROLE_LABELS, homeModules } from './nav-items';

const MODULE_DESCRIPTIONS: Record<string, string> = {
  '/produk': 'Kelola produk, SKU, bundle, dan impor katalog.',
  '/ledger': 'Riwayat setiap perubahan stok per SKU dan gudang.',
  '/team': 'Undang anggota dan atur peran serta akses gudang.',
  '/pengaturan': 'Pengaturan workspace, stok, dan matriks izin.',
  '/profil': 'Profil, kata sandi, dan sesi aktif Anda.',
};

const METRIC_SLOTS = ['Nilai stok', 'SKU stok rendah', 'Transfer berjalan'];

/**
 * Beranda (home) for signed-in users (UTA-113). Module cards link to
 * existing screens. Metric slots are explicit empty states until the
 * business dashboard (Story 16) ships — no invented numbers.
 */
export function Beranda() {
  const router = useRouter();
  const { membership, signedIn, loading } = useMembership();

  useEffect(() => {
    if (!loading && !signedIn) router.replace('/sign-in');
  }, [loading, signedIn, router]);

  if (loading || !signedIn) {
    return (
      <main className="px-4 py-10 sm:px-8" data-testid="beranda-loading">
        <p className="text-sm text-neutral-500">Memuat…</p>
      </main>
    );
  }

  const role = membership?.role ?? null;
  const modules = homeModules(role);

  return (
    <main data-testid="beranda" className="px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Beranda</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Selamat datang di TokoBoss
            {role ? ` · masuk sebagai ${ROLE_LABELS[role] ?? role}` : ''}.
          </p>
        </header>

        <section aria-labelledby="ringkasan-title" className="mb-8">
          <h2
            id="ringkasan-title"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500"
          >
            Ringkasan
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {METRIC_SLOTS.map((label) => (
              <div
                key={label}
                data-testid="metric-empty"
                className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4"
              >
                <p className="text-sm font-medium text-neutral-700">{label}</p>
                <p className="mt-2 text-xs text-neutral-500">
                  Belum tersedia. Angka akan muncul setelah dasbor bisnis
                  selesai.
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="modul-title">
          <h2
            id="modul-title"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500"
          >
            Modul
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                data-testid={`home-card-${m.testId}`}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
              >
                <span aria-hidden className="text-2xl">
                  {m.icon}
                </span>
                <p className="mt-2 font-semibold text-neutral-900">{m.label}</p>
                <p className="mt-1 text-sm text-neutral-600">
                  {MODULE_DESCRIPTIONS[m.href] ?? ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
