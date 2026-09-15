import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { getAuthCopy } from '@/lib/auth-copy';

export const metadata = { title: 'Sign in — TokoBoss' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ expired?: string; signedOut?: string }>;
}) {
  const copy = getAuthCopy('en');
  const params = (await searchParams) ?? {};
  return (
    <AuthShell title={copy.signInTitle} subtitle={copy.signInSubtitle}>
      <SignInForm
        expired={params.expired === '1'}
        signedOut={params.signedOut === '1'}
      />
    </AuthShell>
  );
}
