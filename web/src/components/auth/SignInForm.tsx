'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthClientError, signIn } from '@/lib/auth-client';
import { getAuthCopy } from '@/lib/auth-copy';
import { AuthAlert } from './AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

export function SignInForm({
  expired = false,
  signedOut = false,
}: {
  expired?: boolean;
  signedOut?: boolean;
}) {
  const copy = getAuthCopy('en');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password || !workspaceId.trim()) {
      setError(copy.validationError);
      return;
    }
    setPending(true);
    try {
      await signIn({
        email: email.trim(),
        password,
        workspaceId: workspaceId.trim(),
      });
      router.push('/sessions');
      router.refresh();
    } catch (err) {
      // Client-safe by contract: never echoes the email/password.
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="sign-in-form">
      {expired ? (
        <AuthAlert tone="info" testId="expired-notice">
          {copy.expiredNotice}
        </AuthAlert>
      ) : null}
      {signedOut ? (
        <AuthAlert tone="info" testId="signed-out-notice">
          {copy.signedOutNotice}
        </AuthAlert>
      ) : null}
      {error ? <AuthAlert testId="sign-in-error">{error}</AuthAlert> : null}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="signin-email"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.emailLabel}
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="signin-password"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.passwordLabel}
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="signin-workspace"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.workspaceLabel}
          </label>
          <input
            id="signin-workspace"
            name="workspaceId"
            type="text"
            autoComplete="off"
            required
            placeholder={copy.workspacePlaceholder}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            aria-describedby="signin-workspace-hint"
            aria-invalid={error ? true : undefined}
            className={inputClass}
          />
          <p
            id="signin-workspace-hint"
            className="mt-1 text-xs text-neutral-500"
          >
            {copy.workspaceHint}
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-base font-semibold text-white shadow-sm hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60"
      >
        {pending ? copy.signingIn : copy.signInButton}
      </button>

      <p className="mt-4 text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
        >
          {copy.forgotPasswordLink}
        </Link>
      </p>
    </form>
  );
}
