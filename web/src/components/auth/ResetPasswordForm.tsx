'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthClientError, confirmPasswordReset } from '@/lib/auth-client';
import { getAuthCopy } from '@/lib/auth-copy';
import { AuthAlert } from './AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]';

export function ResetPasswordForm({ token }: { token: string }) {
  const copy = getAuthCopy('en');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(copy.validationError);
      return;
    }
    setPending(true);
    try {
      await confirmPasswordReset({ resetToken: token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthAlert testId="reset-missing-token">
        {copy.validationError}{' '}
        <Link href="/forgot-password" className="underline underline-offset-2">
          {copy.forgotButton}
        </Link>
      </AuthAlert>
    );
  }

  if (done) {
    return (
      <div>
        <AuthAlert tone="success" testId="reset-done">
          {copy.resetDone}
        </AuthAlert>
        <p className="mt-4 text-center text-sm">
          <Link
            href="/sign-in"
            className="text-secondary-700 underline underline-offset-2"
          >
            {copy.backToSignInLink}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="reset-form">
      {error ? <AuthAlert testId="reset-error">{error}</AuthAlert> : null}
      <div>
        <label
          htmlFor="reset-password"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          {copy.newPasswordLabel}
        </label>
        <input
          id="reset-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="reset-hint"
          className={inputClass}
        />
        <p id="reset-hint" className="mt-1 text-xs text-neutral-500">
          {copy.resetSubtitle}
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-base font-semibold text-white shadow-sm hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? copy.resetting : copy.resetButton}
      </button>
    </form>
  );
}
