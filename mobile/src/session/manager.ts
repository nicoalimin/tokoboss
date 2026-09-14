/**
 * Session manager (UTA-13).
 *
 * Owns the signed-in / signed-out state machine used by the Expo Router
 * shells. Provider-agnostic: sign-in payloads arrive already validated
 * against `@tokoboss/contracts` (e.g. from `MockAuthProvider` today, a
 * real provider's BFF exchange later).
 *
 * - Access tokens are served from the secure store; expired tokens trigger
 *   exactly one refresh attempt, then fail closed (clear + signed out).
 * - Nothing here logs token values. The `onEvent` hook carries redacted
 *   metadata (`userId` presence, not values) for observability.
 */

import { SessionTokensSchema, type SessionTokens } from '@tokoboss/contracts';
import type { SecureSessionStore, SessionRefreshPort } from './ports';

export interface SessionEvent {
  type: 'signed-in' | 'signed-out' | 'refreshed' | 'refresh-failed';
  /** True when a user id is attached — never the id itself. */
  hasUser: boolean;
}

export interface SessionManagerOptions {
  store: SecureSessionStore;
  refreshPort?: SessionRefreshPort | undefined;
  /** Injectable clock for tests. */
  now?: () => number;
  onEvent?: ((event: SessionEvent) => void) | undefined;
  /** Skew (ms) before `expiresAt` at which a token counts as expired. */
  expirySkewMs?: number;
}

export class SessionManager {
  private readonly store: SecureSessionStore;
  private readonly refreshPort: SessionRefreshPort | undefined;
  private readonly now: () => number;
  private readonly onEvent: ((event: SessionEvent) => void) | undefined;
  private readonly expirySkewMs: number;

  constructor(options: SessionManagerOptions) {
    this.store = options.store;
    this.refreshPort = options.refreshPort;
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent;
    this.expirySkewMs = options.expirySkewMs ?? 30_000;
  }

  /** Persist a freshly authenticated session (already contract-validated). */
  async signIn(tokens: SessionTokens): Promise<void> {
    await this.store.saveSession(SessionTokensSchema.parse(tokens));
    this.onEvent?.({ type: 'signed-in', hasUser: true });
  }

  async signOut(): Promise<void> {
    await this.store.clearSession();
    this.onEvent?.({ type: 'signed-out', hasUser: false });
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.store.loadSession()) !== null;
  }

  /** Opaque user id for UI greetings — safe to display, never logged. */
  async getUserId(): Promise<string | null> {
    const session = await this.store.loadSession();
    return session ? session.userId : null;
  }

  /**
   * Return a usable access token, refreshing once when expired.
   * Returns `null` (and clears storage) when no session can be restored.
   */
  async getAccessToken(): Promise<string | null> {
    const session = await this.store.loadSession();
    if (!session) return null;
    if (!this.isExpired(session)) return session.accessToken;
    if (!this.refreshPort) {
      await this.store.clearSession();
      this.onEvent?.({ type: 'signed-out', hasUser: false });
      return null;
    }
    try {
      const next = await this.refreshPort.refresh(session.refreshToken);
      await this.store.saveSession(SessionTokensSchema.parse(next));
      this.onEvent?.({ type: 'refreshed', hasUser: true });
      return next.accessToken;
    } catch {
      await this.store.clearSession();
      this.onEvent?.({ type: 'refresh-failed', hasUser: false });
      return null;
    }
  }

  private isExpired(session: SessionTokens): boolean {
    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt - this.expirySkewMs <= this.now();
  }
}
