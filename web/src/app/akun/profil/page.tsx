import Link from 'next/link';
import { ProfilePanel } from '@/components/profile/ProfilePanel';
import { SessionsPanel } from '@/components/auth/SessionsPanel';
import { getProfileCopy } from '@/lib/profile-copy';

export const metadata = { title: 'Profil — TokoBoss' };

/**
 * Account Profil page (US29 / RFC 02 row 57).
 *
 * Account-level, so no workspace membership is checked: the panels call the
 * account-session APIs and handle a missing session themselves. Renders the
 * existing `ProfilePanel` + `SessionsPanel`. Reached from the workspace
 * switcher menu in every workspace. With no workspace in the URL, the back
 * link goes to `/go/dashboard` (resolver, row 59). Legacy `/profil` stays
 * until middleware (row 60) redirects it.
 */
export default function AkunProfilPage() {
  const copy = getProfileCopy('en');
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="profil-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="profil-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.profileTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            {copy.profileSubtitle}
          </p>
          <ProfilePanel />
        </section>

        <section
          aria-labelledby="profil-sessions-title"
          className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h2
            id="profil-sessions-title"
            className="text-lg font-semibold text-neutral-900"
          >
            {copy.sessionsTitle}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 mb-4">
            {copy.sessionsHint}{' '}
            <Link
              href="/akun/sesi"
              className="underline underline-offset-2 text-secondary-700 hover:text-secondary-800"
            >
              {copy.viewSessionsLink}
            </Link>
          </p>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <SessionsPanel />
          </div>
        </section>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/go/dashboard"
            className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
          >
            {copy.backHomeLink}
          </Link>
        </p>
      </div>
    </main>
  );
}
