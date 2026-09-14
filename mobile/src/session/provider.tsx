/**
 * Session React context + BFF-wired API client (UTA-13).
 *
 * Glue between Expo Router shells and the pure session/API modules:
 * - Secure store: `ExpoSecureSessionStore` (Keychain / EncryptedSharedPrefs).
 * - Sign-in: provider-agnostic `MockAuthProvider` from `@tokoboss/auth`
 *   (real providers slot in behind the same ports later).
 * - Refresh: BFF `POST /api/v1/session/refresh` via `createBffRefreshPort`.
 * - API client: `createApiClient` with the manager's access token and a
 *   401 → refresh → retry hook.
 *
 * Screens consume `useSession()` only — never the store or tokens directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { MockAuthProvider } from '@tokoboss/auth';
import { createApiClient, type ApiClient } from '../api/client';
import { resolveMobileEnv } from '../env';
import { ExpoSecureSessionStore } from './expo-secure-store.adapter';
import { SessionManager } from './manager';
import { createBffRefreshPort } from './refresh.adapter';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

interface SessionContextValue {
  status: SessionStatus;
  userId: string | null;
  api: ApiClient;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  lastError: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const env = useMemo(() => resolveMobileEnv(), []);
  const manager = useMemo(
    () =>
      new SessionManager({
        store: new ExpoSecureSessionStore(),
        refreshPort: createBffRefreshPort(env.apiBaseUrl),
      }),
    [env.apiBaseUrl]
  );

  const refreshStatus = useCallback(async () => {
    const signedIn = await manager.isSignedIn();
    setUserId(signedIn ? await manager.getUserId() : null);
    setStatus(signedIn ? 'signed-in' : 'signed-out');
  }, [manager]);

  useEffect(() => {
    refreshStatus().catch(() => setStatus('signed-out'));
  }, [refreshStatus]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: env.apiBaseUrl,
        getAccessToken: () => manager.getAccessToken(),
        onUnauthorized: () => manager.getAccessToken(),
      }),
    [env.apiBaseUrl, manager]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLastError(null);
      try {
        // Port/adapter pattern: the mock provider stands in for a real
        // auth provider until UTA scope adds one. Tokens stay opaque.
        const session = await new MockAuthProvider().authenticate({
          email,
          password,
        });
        await manager.signIn({
          accessToken: session.token,
          refreshToken: `${session.token}:refresh`,
          expiresAt: session.expiresAt.toISOString(),
          userId: session.userId,
        });
        setStatus('signed-in');
        setUserId(session.userId);
      } catch {
        setLastError('Sign-in failed. Check your details and try again.');
        throw new Error('Sign-in failed.');
      }
    },
    [manager]
  );

  const signOut = useCallback(async () => {
    await manager.signOut();
    setUserId(null);
    setStatus('signed-out');
  }, [manager]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, userId, api, signIn, signOut, lastError }),
    [status, userId, api, signIn, signOut, lastError]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error('useSession must be used inside <SessionProvider>.');
  return ctx;
}
