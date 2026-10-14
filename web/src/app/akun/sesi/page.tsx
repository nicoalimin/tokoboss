import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SessionsPanel } from '@/components/auth/SessionsPanel';
import { getAuthCopy } from '@/lib/auth-copy';
import { getProfileCopy } from '@/lib/profile-copy';

export const metadata = { title: 'Active sessions — TokoBoss' };

/**
 * Account Sesi aktif page (US29 / RFC 02 row 58).
 *
 * Account-level, so no workspace membership is checked: SessionsPanel calls
 * the account-session APIs and handles a missing session itself. Reached from
 * the workspace switcher menu in every workspace. With no workspace in the
 * URL, the back link goes to `/go/dashboard` (resolver, row 59). Legacy
 * `/sessions` stays until middleware (row 60) redirects it.
 */
export default function AkunSesiPage() {
  const copy = getAuthCopy('en');
  const profileCopy = getProfileCopy('en');
  return (
    <AuthShell
      title={copy.sessionsTitle}
      subtitle={copy.sessionsSubtitle}
      footer={
        <Link
          href="/go/dashboard"
          className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
        >
          {profileCopy.backHomeLink}
        </Link>
      }
    >
      <SessionsPanel />
    </AuthShell>
  );
}
