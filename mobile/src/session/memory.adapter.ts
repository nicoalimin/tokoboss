/**
 * In-memory session store — TESTS AND PREVIEWS ONLY.
 *
 * This adapter is intentionally insecure (plain process memory) so tests
 * and Expo Go previews can run without native secure storage. Production
 * builds must wire `ExpoSecureSessionStore`.
 */

import { SessionTokensSchema, type SessionTokens } from '@tokoboss/contracts';
import type { SecureSessionStore } from './ports';

export class InMemorySessionStore implements SecureSessionStore {
  private raw: string | null = null;

  async saveSession(tokens: SessionTokens): Promise<void> {
    // Validate on the way in so corrupt shapes fail fast, like the
    // secure adapter does.
    this.raw = JSON.stringify(SessionTokensSchema.parse(tokens));
  }

  async loadSession(): Promise<SessionTokens | null> {
    if (!this.raw) return null;
    try {
      const parsed = SessionTokensSchema.safeParse(JSON.parse(this.raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    this.raw = null;
  }
}
