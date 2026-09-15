'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TeamClientError,
  acceptInvite,
} from '@/lib/team-client';
import { getTeamCopy } from '@/lib/team-copy';
import { AuthAlert } from '../auth/AuthAlert';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

/**
 * Invite-accept form (UTA-71).
 *
 * Token-gated: no session required. Posts `{ token, newPassword? }` to
 * `POST /api/invites/accept`. The ticket itself is never logged or echoed
 * back — success shows opaque ids only. Expired sessions cannot happen here
 * (no cookie needed), but invalid/expired tickets map to dedicated copy.
 */
export function AcceptInviteForm({ initialToken = '' }: { initialToken?: string }) {
  const copy = getTeamCopy('en');
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!token.trim()) {
      setError(copy.validationError);
      return;
    }
    setPending(true);
    try {
      const result = await acceptInvite({
        token: token.trim(),
        ...(newPassword ? { newPassword } : {}),
      });
      // Keep the ticket out of the success message — opaque ids only.
      setDone(`${copy.acceptDone} (${result.workspaceId})`);
      setToken('');
      setNewPassword('');
    } catch (err) {
      setError(
        err instanceof TeamClientError ? err.message : copy.genericError
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="accept-invite-form">
      {error ? <AuthAlert testId="accept-error">{error}</AuthAlert> : null}
      {done ? (
        <AuthAlert tone="success" testId="accept-done">
          {done}
        </AuthAlert>
      ) : null}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="accept-token"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.tokenLabel}
          </label>
          <input
            id="accept-token"
            name="token"
            type="text"
            autoComplete="off"
            required
            placeholder={copy.tokenPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={`${inputClass} font-mono text-sm`}
          />
        </div>
        <div>
          <label
            htmlFor="accept-password"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {copy.newPasswordLabel}
          </label>
          <input
            id="accept-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-describedby="accept-password-hint"
            className={inputClass}
          />
          <p id="accept-password-hint" className="mt-1 text-xs text-neutral-500">
            {copy.newPasswordHint}
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] text-base font-semibold text-white shadow-sm hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60"
      >
        {pending ? copy.accepting : copy.acceptButton}
      </button>

      <p className="mt-4 text-center text-sm">
        <button
          type="button"
          onClick={() => router.push('/team')}
          className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
        >
          {copy.backToTeamLink}
        </button>
      </p>
    </form>
  );
}
