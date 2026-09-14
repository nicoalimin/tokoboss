import { z } from 'zod';

/**
 * Versioned HTTP API surface (UTA-13).
 *
 * Mobile talks to the Next.js BFF over HTTP only, and only to versioned
 * routes (`/api/v1/...`). Server Actions are banned from mobile — see
 * `mobile/src/api/client.ts` and the `no-server-actions` test.
 */

/** Current API version consumed by mobile. Bump = new route namespace. */
export const API_VERSION = 'v1' as const;

/** Prefix every versioned BFF route carries. */
export const API_VERSION_PREFIX = `/api/${API_VERSION}` as const;

/**
 * Join a path onto the versioned prefix.
 * Throws on absolute URLs, protocol-relative URLs, and unversioned paths
 * so callers cannot accidentally target Server Actions or web pages.
 */
export function versionedPath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(
      `versionedPath: expected a root-relative path, got ${JSON.stringify(path)}`
    );
  }
  if (
    path === API_VERSION_PREFIX ||
    path.startsWith(`${API_VERSION_PREFIX}/`)
  ) {
    return path;
  }
  throw new Error(
    `versionedPath: path must start with ${API_VERSION_PREFIX}, got ${JSON.stringify(path)}`
  );
}

/**
 * BFF liveness payload (`GET /api/v1/health`).
 * Mirrors the web `/api/health` shape so one schema validates both.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  env: z.string(),
  timestamp: z.string().datetime(),
  deploymentId: z.string().nullable(),
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Stable versioned route table. Add routes here, never inline strings. */
export const ApiRoutes = {
  health: '/api/v1/health',
  session: '/api/v1/session',
  sessionRefresh: '/api/v1/session/refresh',
} as const;
export type ApiRoute = (typeof ApiRoutes)[keyof typeof ApiRoutes];
