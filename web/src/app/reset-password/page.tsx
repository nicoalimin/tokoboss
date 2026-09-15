import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { getAuthCopy } from '@/lib/auth-copy';

export const metadata = { title: 'Reset password — TokoBoss' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const copy = getAuthCopy('en');
  const params = (await searchParams) ?? {};
  const token = typeof params.token === 'string' ? params.token : '';
  return (
    <AuthShell
      title={copy.resetTitle}
      subtitle={copy.resetSubtitle}
      footer={
        <Link
          href="/sign-in"
          className="text-secondary-700 underline underline-offset-2"
        >
          {copy.backToSignInLink}
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
