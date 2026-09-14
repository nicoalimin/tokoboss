/**
 * Typed, authenticated HTTP client for the versioned BFF API (UTA-13).
 *
 * Rules enforced here:
 * - HTTP only, against versioned routes (`/api/v1/...`, see
 *   `@tokoboss/contracts` `ApiRoutes` + `versionedPath`).
 * - Every response is validated with a shared contract schema.
 * - Mobile NEVER calls Next.js Server Actions: routes are constrained to
 *   the versioned prefix and `next/` imports are banned by test.
 * - Tokens travel in the `Authorization` header only; they are never
 *   logged — the optional `onEvent` hook receives redacted metadata.
 */

import {
  ApiRoutes,
  ErrorCode,
  HealthResponseSchema,
  SessionResponseSchema,
  versionedPath,
  type HealthResponse,
  type SessionTokens,
} from '@tokoboss/contracts';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  headersFromContext,
  newCorrelationId,
  newRequestId,
  redact,
} from '@tokoboss/observability';
import { z } from 'zod';

export interface ApiEvent {
  route: string;
  method: string;
  status: number;
  requestId: string;
  correlationId: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  /** Called once on 401: refresh the session, return the new token (or null). */
  onUnauthorized?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Receives redacted metadata only — never tokens or bodies. */
  onEvent?: (event: ApiEvent) => void;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

const ErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

type FetchImpl = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

export interface ApiClient {
  /** Unauthenticated liveness probe, validated against shared contracts. */
  getHealth: () => Promise<HealthResponse>;
  /**
   * Mock-authenticated request: fetches the current session with a Bearer
   * token and validates the payload through shared contracts.
   */
  getSession: () => Promise<SessionTokens>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = (options.fetchImpl ?? fetch) as unknown as FetchImpl;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function request<T>(
    route: string,
    schema: z.ZodType<T>,
    init: { method?: string; authenticated?: boolean; body?: unknown } = {}
  ): Promise<T> {
    // Throws unless the route is a versioned BFF path — Server Actions,
    // unversioned pages, and absolute URLs can never reach the network.
    const path = versionedPath(route);
    const method = init.method ?? 'GET';
    const requestId = newRequestId();
    const correlationId = newCorrelationId();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...headersFromContext({ requestId, correlationId }),
    };

    if (init.authenticated !== false) {
      const token = await options.getAccessToken();
      if (token) headers['authorization'] = `Bearer ${token}`;
    }

    const doFetch = async (retryHeaders: Record<string, string>) =>
      fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: retryHeaders,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

    let res = await doFetch(headers);

    if (
      res.status === 401 &&
      options.onUnauthorized &&
      init.authenticated !== false
    ) {
      const refreshed = await options.onUnauthorized().catch(() => null);
      if (refreshed) {
        res = await doFetch({
          ...headers,
          authorization: `Bearer ${refreshed}`,
        });
      }
    }

    // Metadata for observability is redacted before it leaves this module,
    // so a token can never slip into logs via headers or bodies.
    const event = redact({
      route: path,
      method,
      status: res.status,
      requestId,
      correlationId,
    }) as ApiEvent;
    options.onEvent?.(event);

    if (res.status === 401) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Session expired — sign in again.',
        401,
        requestId
      );
    }

    const json = (await res.json().catch(() => null)) as unknown;
    if (res.status < 200 || res.status >= 300) {
      const envelope = ErrorEnvelopeSchema.safeParse(json);
      throw new ApiError(
        envelope.success ? envelope.data.error.code : ErrorCode.INTERNAL_ERROR,
        envelope.success
          ? envelope.data.error.message
          : `Request failed (${res.status})`,
        res.status,
        requestId
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'BFF response did not match shared contracts.',
        res.status,
        requestId
      );
    }
    return parsed.data;
  }

  return {
    getHealth: () =>
      request(ApiRoutes.health, HealthResponseSchema, { authenticated: false }),
    getSession: async () => {
      const envelope = await request(ApiRoutes.session, SessionResponseSchema, {
        authenticated: true,
      });
      return envelope.data;
    },
  };
}

/** Header names re-exported for tests and adapters. */
export { CORRELATION_ID_HEADER, REQUEST_ID_HEADER };
