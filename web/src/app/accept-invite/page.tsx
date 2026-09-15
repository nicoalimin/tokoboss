import { AuthShell } from '@/components/auth/AuthShell';
import { AcceptInviteForm } from '@/components/team/AcceptInviteForm';
import { getTeamCopy } from '@/lib/team-copy';

/**
 * Invite-accept page (UTA-71).
 *
 * Token-gated — no session required. Accepts `?token=` so an Admin can link
 * straight from the one-time ticket (`/accept-invite?token=…`); the ticket
 * is sent only in the POST body, never logged.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const copy = getTeamCopy('en');
  const params = (await searchParams) ?? {};
  return (
    <AuthShell title={copy.acceptTitle} subtitle={copy.acceptSubtitle}>
      <AcceptInviteForm initialToken={params.token ?? ''} />
    </AuthShell>
  );
}
