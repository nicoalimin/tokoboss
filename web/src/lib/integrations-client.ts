/**
 * Browser client for the US20 integrations Route Handlers (RFC 04 task
 * 101a): the shared request helper plus the connection list / detail reads
 * (every member). Listings / order previews (101b) and write calls (101c)
 * live in sibling files and reuse `integrationsRequest`.
 *
 * The session rides the HttpOnly `tb_session` cookie (same-origin); no
 * tokens or keys are kept in JS. Route errors are already client-safe
 * (Bahasa Indonesia, never naming another workspace), so `error` passes
 * through; a non-JSON or empty body gets a generic message. 401 sets
 * `needsReauth`.
 */
import type { IntegrationConnectionView } from '@tokoboss/contracts';

export type FetchFn = typeof fetch;

export const INTEGRATIONS_GENERIC_ERROR = 'Terjadi kesalahan. Coba lagi.';

export class IntegrationClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = 'IntegrationClientError';
    this.status = status;
    this.errorCode = errorCode;
    this.needsReauth = status === 401;
  }
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === 'object') {
      return data as Record<string, unknown>;
    }
  } catch {
    // Non-JSON (proxies, empty 500s) → generic message below.
  }
  return {};
}

/** `/api/workspaces/:workspaceId/integrations[/...segments]`, encoded. */
export function integrationsPath(
  workspaceId: string,
  ...segments: string[]
): string {
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/integrations`;
  return [base, ...segments.map((s) => encodeURIComponent(s))].join('/');
}

/** One same-origin JSON call; a non-2xx response throws the client error. */
export async function integrationsRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchFn: FetchFn = fetch
): Promise<T> {
  const res = await fetchFn(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    ...(init.body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(init.body),
        }),
  });
  const data = await readBody(res);
  if (!res.ok) {
    const code = data['errorCode'];
    const error = data['error'];
    throw new IntegrationClientError(
      res.status,
      typeof code === 'string' ? code : 'INTEGRATION_FAILED',
      typeof error === 'string' && error ? error : INTEGRATIONS_GENERIC_ERROR
    );
  }
  return data as T;
}

/** GET the workspace's store connections (every member; removed hidden). */
export async function getIntegrationConnections(
  workspaceId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView[]> {
  const data = await integrationsRequest<{
    connections?: IntegrationConnectionView[];
  }>(integrationsPath(workspaceId), {}, fetchFn);
  return Array.isArray(data.connections) ? data.connections : [];
}

/** GET one connection (every member; unknown or removed → 404 error). */
export async function getIntegrationConnection(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView> {
  const data = await integrationsRequest<{
    connection: IntegrationConnectionView;
  }>(integrationsPath(workspaceId, connectionId), {}, fetchFn);
  return data.connection;
}
