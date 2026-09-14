// Health / readiness payload builders (UTA-12).
//
// Pure functions shared by the web routes (`/api/health`, `/api/ready`) so
// the safety invariant — no tenant data, no infrastructure secrets — is
// covered by unit tests, not just code review. Routes must only serialize
// what these builders return.

export interface HealthResponse {
  status: 'ok';
  service: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
  requestId?: string;
}

export interface ReadinessCheck {
  name: 'env' | 'deployment';
  status: 'ok' | 'degraded';
}

export interface ReadinessResponse {
  ready: boolean;
  service: string;
  environment: string;
  checks: ReadinessCheck[];
  requestId?: string;
}

const FORBIDDEN_HEALTH_KEYS = [
  'tenant',
  'secret',
  'token',
  'password',
  'database_url',
  'connection',
  'private',
  'pii',
  'email',
  'phone',
] as const;

export function buildHealthResponse(input: {
  service?: string;
  environment?: string;
  version?: string;
  uptimeSeconds?: number;
  requestId?: string;
}): HealthResponse {
  return {
    status: 'ok',
    service: input.service ?? 'tokoboss-web',
    environment: input.environment ?? 'local',
    version: input.version ?? '0.0.0',
    uptimeSeconds: Math.max(0, Math.floor(input.uptimeSeconds ?? 0)),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };
}

export function buildReadinessResponse(input: {
  service?: string;
  environment?: string;
  envValid: boolean;
  requestId?: string;
}): ReadinessResponse {
  const checks: ReadinessCheck[] = [
    { name: 'env', status: input.envValid ? 'ok' : 'degraded' },
    { name: 'deployment', status: 'ok' },
  ];
  return {
    ready: input.envValid,
    service: input.service ?? 'tokoboss-web',
    environment: input.environment ?? 'local',
    checks,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };
}

/** Test helper: assert a health/readiness payload leaks no tenant/secret keys. */
export function assertNoSensitiveKeys(payload: unknown): string[] {
  const found: string[] = [];
  const haystack = JSON.stringify(payload).toLowerCase();
  for (const key of FORBIDDEN_HEALTH_KEYS) {
    if (haystack.includes(key)) found.push(key);
  }
  return found;
}
