/**
 * BFF-backed session refresh port (UTA-13).
 *
 * Exchanges a refresh token at `POST /api/v1/session/refresh` and
 * validates the result against shared contracts. No provider SDK —
 * plain versioned HTTP, like every other mobile call.
 */

import {
  ApiRoutes,
  RefreshRequestSchema,
  SessionResponseSchema,
  versionedPath,
} from '@tokoboss/contracts';
import type { SessionRefreshPort } from './ports';
import type { SessionTokens } from '@tokoboss/contracts';

export function createBffRefreshPort(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): SessionRefreshPort {
  const base = baseUrl.replace(/\/$/, '');
  return {
    refresh: async (refreshToken: string): Promise<SessionTokens> => {
      const path = versionedPath(ApiRoutes.sessionRefresh);
      const res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(RefreshRequestSchema.parse({ refreshToken })),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      const parsed = SessionResponseSchema.safeParse(json);
      if (!parsed.success || !res.ok) {
        throw new Error('Session refresh failed.');
      }
      return parsed.data.data;
    },
  };
}
