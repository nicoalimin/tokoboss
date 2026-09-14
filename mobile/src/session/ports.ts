/**
 * Secure session ports (UTA-13).
 *
 * Port/adapter pattern: the app depends only on these interfaces, never on
 * a concrete auth provider (Clerk/Auth0/etc.) or storage engine.
 *
 * Security rules:
 * - Session tokens live ONLY in platform secure storage
 *   (iOS Keychain / Android EncryptedSharedPreferences via
 *   `expo-secure-store`). Plain AsyncStorage is banned by test.
 * - Tokens are never written to logs — validate with `redact()` /
 *   `assertNoSecrets` from `@tokoboss/observability`.
 */

import type { SessionTokens } from '@tokoboss/contracts';

/** Durable, secure backing for exactly one session. */
export interface SecureSessionStore {
  saveSession: (tokens: SessionTokens) => Promise<void>;
  loadSession: () => Promise<SessionTokens | null>;
  clearSession: () => Promise<void>;
}

/**
 * Refresh port implemented against the versioned BFF
 * (`POST /api/v1/session/refresh`). No provider SDK leaks into mobile.
 */
export interface SessionRefreshPort {
  refresh: (refreshToken: string) => Promise<SessionTokens>;
}
