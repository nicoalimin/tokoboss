'use client';

import Link from 'next/link';
import {
  SETTINGS_ROWS,
  getSettingsCopy,
  rowCopy,
  type SettingsLang,
} from '@/lib/settings-copy';
import { canManageTeam } from '@/lib/role-matrix';
import { useMembership } from '@/lib/use-membership';

/**
 * Settings hub row list (UTA-74, Story 23 — Pengaturan).
 *
 * Seven clickable rows: Profil, Tim & Akses (live) plus Gudang, Integrasi,
 * Bahasa, Notifikasi, Paket & Tagihan (honest coming-soon stubs). Admin-only
 * rows carry a text badge; when the signed-in role is known non-Admin the
 * Tim & Akses row shows the read-only hint. Every row is a real link so
 * deep links stay testable; stubs render an honest empty state.
 */
export function SettingsHub({ lang = 'en' }: { lang?: SettingsLang }) {
  const copy = getSettingsCopy(lang);
  const { membership } = useMembership();
  const knownNonAdmin = membership !== null && !canManageTeam(membership.role);

  return (
    <div data-testid="settings-hub">
      <ul
        aria-label={copy.settingsTitle}
        className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white"
      >
        {SETTINGS_ROWS.map((row) => {
          const { label, hint } = rowCopy(copy, row.slug);
          const locked = row.adminOnly && knownNonAdmin;
          return (
            <li key={row.slug} data-testid={`settings-row-${row.slug}`}>
              <Link
                href={row.href}
                data-testid={`settings-link-${row.slug}`}
                aria-disabled={locked || undefined}
                className="flex items-center justify-between gap-3 px-4 py-4 min-h-[44px] hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-900">
                    {label}
                    {row.adminOnly ? (
                      <span
                        data-testid={`settings-badge-${row.slug}`}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                      >
                        {copy.adminOnlyBadge}
                      </span>
                    ) : null}
                    {row.live ? null : (
                      <span
                        data-testid={`settings-soon-${row.slug}`}
                        className="rounded-full bg-info-100 px-2 py-0.5 text-xs font-medium text-info-800"
                      >
                        {copy.comingSoon}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-neutral-500">
                    {locked ? copy.lockedForRole : hint}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-neutral-400">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
