import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  SETTINGS_ROWS,
  getSettingsCopy,
  rowCopy,
  type SettingsAreaSlug,
} from '@/lib/settings-copy';

export const metadata = { title: 'Pengaturan — TokoBoss' };

const STUB_SLUGS: SettingsAreaSlug[] = [
  'gudang',
  'integrasi',
  'bahasa',
  'notifikasi',
  'tagihan',
];

interface PageProps {
  params: Promise<{ area: string }>;
}

/**
 * Coming-soon stub for Settings areas owned by later stories (UTA-74).
 *
 * Only the five non-live rows resolve here; `profil`/`tim` have real
 * routes and anything else 404s. Honest empty state, never a fake form.
 */
export default async function PengaturanAreaPage({ params }: PageProps) {
  const { area } = await params;
  if (!(STUB_SLUGS as string[]).includes(area)) notFound();
  const slug = area as SettingsAreaSlug;
  const copy = getSettingsCopy('en');
  const row = SETTINGS_ROWS.find((r) => r.slug === slug);
  const { label } = rowCopy(copy, slug);
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="stub-title"
          data-testid={`settings-stub-${slug}`}
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <p
            data-testid="settings-stub-badge"
            className="inline-block rounded-full bg-info-100 px-2 py-0.5 text-xs font-medium text-info-800"
          >
            {copy.comingSoon}
          </p>
          <h1
            id="stub-title"
            className="mt-2 text-2xl font-semibold text-neutral-900 mb-1"
          >
            {label}
          </h1>
          <p className="text-sm text-neutral-600 mb-1">{copy.stubTitle}</p>
          <p className="text-sm text-neutral-600">{copy.stubBody}</p>
          {row?.adminOnly ? (
            <p
              data-testid="settings-stub-admin"
              className="mt-3 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
            >
              {copy.adminOnlyBadge}
            </p>
          ) : null}
          <p className="mt-6 text-center text-sm">
            <Link
              href="/pengaturan"
              className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
            >
              {copy.backToSettingsLink}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
