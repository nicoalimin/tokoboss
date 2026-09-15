'use client';

import { useState } from 'react';
import { AuthClientError, requestPasswordReset } from '@/lib/auth-client';
import { getAuthCopy } from '@/lib/auth-copy';
import { AuthAlert } from './AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 min-h-[44px]';

export function ForgotPasswordForm() {
  const copy = getAuthCopy('en');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError(copy.validationError);
      return;
    }
    setPending(true);
    try {
      await requestPasswordReset(email.trim());
      // Same generic shape whether or not the email exists (no oracle).
      setDone(true);
    } catch (err) {
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthAlert tone="success" testId="forgot-done">
        {copy.forgotDone}
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="forgot-form">
      {error ? <AuthAlert testId="forgot-error">{error}</AuthAlert> : null}
      <div>
        <label
          htmlFor="forgot-email"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          {copy.emailLabel}
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-base font-semibold text-white shadow-sm hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? copy.forgotSending : copy.forgotButton}
      </button>
    </form>
  );
}
