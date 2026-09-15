'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthClientError,
  listSessions,
  signOut,
  signOutAll,
  type SessionView,
} from '@/lib/auth-client';
import { getAuthCopy } from '@/lib/auth-copy';
import { AuthAlert } from './AuthAlert';

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Active-sessions panel (UTA-69).
 *
 * Loads `GET /api/auth/sessions` over the HttpOnly cookie. Any 401 with
 * `INVALID_SESSION` (idle-expired, revoked, or auth-stale after a password
 * reset) redirects to `/sign-in?expired=1` — the web 30m idle re-auth path.
 * The UTA-67 API exposes revoke-this (cookie) and revoke-all only, so the
 * list is read-only apart from those two actions.
 */
export function SessionsPanel() {
  const copy = getAuthCopy('en');
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'this' | 'all'>('idle');

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const load = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch (err) {
      if (err instanceof AuthClientError && err.needsReauth) {
        reauth();
        return;
      }
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
    }
  }, [copy.genericSignInError, reauth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSignOutThis() {
    setError(null);
    setBusy('this');
    try {
      await signOut();
      router.replace('/sign-in?signedOut=1');
      router.refresh();
    } catch (err) {
      if (err instanceof AuthClientError && err.needsReauth) {
        reauth();
        return;
      }
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
      setBusy('idle');
    }
  }

  async function onSignOutAll() {
    setError(null);
    setBusy('all');
    try {
      await signOutAll();
      router.replace('/sign-in?signedOut=1');
      router.refresh();
    } catch (err) {
      if (err instanceof AuthClientError && err.needsReauth) {
        reauth();
        return;
      }
      setError(
        err instanceof AuthClientError ? err.message : copy.genericSignInError
      );
      setBusy('idle');
    }
  }

  return (
    <div data-testid="sessions-panel">
      {error ? <AuthAlert testId="sessions-error">{error}</AuthAlert> : null}

      {sessions === null && !error ? (
        <p role="status" className="text-sm text-neutral-600">
          {copy.sessionsLoading}
        </p>
      ) : null}

      {sessions !== null && sessions.length === 0 ? (
        <p className="text-sm text-neutral-600">{copy.sessionsEmpty}</p>
      ) : null}

      {sessions !== null && sessions.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {sessions.map((s, idx) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {s.deviceLabel || s.platform}
                  {idx === 0 ? (
                    <span className="ml-2 rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                      {copy.currentDevice}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-neutral-500">
                  {s.platform} · last seen {formatDate(s.lastSeenAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onSignOutThis}
          disabled={busy !== 'idle'}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-6 py-3 min-h-[44px] text-sm font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
        >
          {busy === 'this' ? copy.signingOut : copy.signOutThis}
        </button>
        <button
          type="button"
          onClick={onSignOutAll}
          disabled={busy !== 'idle'}
          className="flex-1 rounded-lg bg-error-500 px-6 py-3 min-h-[44px] text-sm font-semibold text-white hover:bg-error-600 disabled:opacity-60"
        >
          {busy === 'all' ? copy.signingOut : copy.signOutAll}
        </button>
      </div>

      <section
        aria-labelledby="security-activity"
        data-testid="security-affordance"
        className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3"
      >
        <h2
          id="security-activity"
          className="text-sm font-semibold text-neutral-800"
        >
          {copy.securityTitle}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          {copy.securityBody}
        </p>
      </section>
    </div>
  );
}
