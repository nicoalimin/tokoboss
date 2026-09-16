import Link from 'next/link';
import { getSettingsCopy, type SettingsLang } from '@/lib/settings-copy';

/**
 * Clear no-access state (UTA-74).
 *
 * Rendered when a signed-in role opens a deep link outside its permission
 * matrix (e.g. Manager/Staff on team management) — and wherever a 403
 * lands. Text-only, honest: the server still enforces access.
 */
export function NoAccess({ lang = 'en' }: { lang?: SettingsLang }) {
  const copy = getSettingsCopy(lang);
  return (
    <div
      role="alert"
      data-testid="no-access"
      className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-4"
    >
      <p className="text-sm font-semibold text-warning-700">
        {copy.noAccessTitle}
      </p>
      <p className="mt-1 text-sm text-neutral-700">{copy.noAccessBody}</p>
      <p className="mt-3 text-sm">
        <Link
          href="/sign-in"
          data-testid="no-access-sign-in"
          className="underline underline-offset-2 text-secondary-700 hover:text-secondary-800"
        >
          {copy.noAccessSignInLink}
        </Link>
      </p>
    </div>
  );
}
