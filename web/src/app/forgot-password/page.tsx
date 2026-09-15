import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { getAuthCopy } from '@/lib/auth-copy';

export const metadata = { title: 'Recover access — TokoBoss' };

export default function ForgotPasswordPage() {
  const copy = getAuthCopy('en');
  return (
    <AuthShell
      title={copy.forgotTitle}
      subtitle={copy.forgotSubtitle}
      footer={
        <Link
          href="/sign-in"
          className="text-secondary-700 underline underline-offset-2"
        >
          {copy.backToSignInLink}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
