import { AuthShell } from '@/components/auth/AuthShell';
import { SessionsPanel } from '@/components/auth/SessionsPanel';
import { getAuthCopy } from '@/lib/auth-copy';

export const metadata = { title: 'Active sessions — TokoBoss' };

export default function SessionsPage() {
  const copy = getAuthCopy('en');
  return (
    <AuthShell title={copy.sessionsTitle} subtitle={copy.sessionsSubtitle}>
      <SessionsPanel />
    </AuthShell>
  );
}
