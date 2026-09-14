import { describe, expect, it } from 'vitest';
import { InMemorySessionStore } from '../session/memory.adapter';
import { SessionManager, type SessionEvent } from '../session/manager';
import type { SessionTokens } from '@tokoboss/contracts';

const TOKENS: SessionTokens = {
  accessToken: 'access-123',
  refreshToken: 'refresh-123',
  expiresAt: '2027-09-14T00:00:00.000Z',
  userId: 'user-1',
};

const EXPIRED: SessionTokens = {
  ...TOKENS,
  expiresAt: '2020-01-01T00:00:00.000Z',
};

describe('session manager', () => {
  it('round-trips sign-in state through the secure store', async () => {
    const manager = new SessionManager({ store: new InMemorySessionStore() });
    await expect(manager.isSignedIn()).resolves.toBe(false);
    await manager.signIn(TOKENS);
    await expect(manager.isSignedIn()).resolves.toBe(true);
    await expect(manager.getAccessToken()).resolves.toBe(TOKENS.accessToken);
    await manager.signOut();
    await expect(manager.isSignedIn()).resolves.toBe(false);
  });

  it('refreshes an expired token exactly once', async () => {
    const store = new InMemorySessionStore();
    const events: SessionEvent[] = [];
    const refreshed: SessionTokens = { ...TOKENS, accessToken: 'access-456' };
    const manager = new SessionManager({
      store,
      refreshPort: { refresh: async () => refreshed },
      now: () => Date.parse('2026-09-14T00:00:00.000Z'),
      onEvent: (e) => events.push(e),
    });
    await manager.signIn(EXPIRED);
    await expect(manager.getAccessToken()).resolves.toBe('access-456');
    // Refreshed tokens are persisted for the next cold start.
    await expect(store.loadSession()).resolves.toMatchObject({
      accessToken: 'access-456',
    });
    expect(events.map((e) => e.type)).toContain('refreshed');
  });

  it('fails closed when refresh fails: storage cleared, null token', async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager({
      store,
      refreshPort: {
        refresh: async () => {
          throw new Error('provider down');
        },
      },
      now: () => Date.parse('2026-09-14T00:00:00.000Z'),
    });
    await manager.signIn(EXPIRED);
    await expect(manager.getAccessToken()).resolves.toBeNull();
    await expect(store.loadSession()).resolves.toBeNull();
  });

  it('never exposes token values through events', async () => {
    const events: SessionEvent[] = [];
    const manager = new SessionManager({
      store: new InMemorySessionStore(),
      onEvent: (e) => events.push(e),
    });
    await manager.signIn(TOKENS);
    await manager.signOut();
    expect(JSON.stringify(events)).not.toContain(TOKENS.accessToken);
    expect(JSON.stringify(events)).not.toContain(TOKENS.refreshToken);
  });

  it('rejects malformed sessions at sign-in', async () => {
    const manager = new SessionManager({ store: new InMemorySessionStore() });
    await expect(
      manager.signIn({
        accessToken: '',
        refreshToken: '',
        expiresAt: 'nope',
        userId: '',
      })
    ).rejects.toThrow();
  });
});
