import { describe, expect, it } from 'vitest';
import {
  assertNoSensitiveKeys,
  buildHealthResponse,
  buildReadinessResponse,
} from '../health';

describe('health payloads expose no tenant data or secrets', () => {
  it('health response has only safe fields', () => {
    const payload = buildHealthResponse({
      environment: 'preview',
      version: 'uta-12',
      uptimeSeconds: 42.7,
      requestId: 'req_abc',
    });
    expect(payload).toEqual({
      status: 'ok',
      service: 'tokoboss-web',
      environment: 'preview',
      version: 'uta-12',
      uptimeSeconds: 42,
      requestId: 'req_abc',
    });
    expect(assertNoSensitiveKeys(payload)).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(
      /postgres|secret|token|tenant.+@/i
    );
  });

  it('readiness reports checks without secret values', () => {
    const ready = buildReadinessResponse({ envValid: true });
    expect(ready.ready).toBe(true);
    expect(assertNoSensitiveKeys(ready)).toEqual([]);

    const degraded = buildReadinessResponse({ envValid: false });
    expect(degraded.ready).toBe(false);
    expect(degraded.checks).toContainEqual({ name: 'env', status: 'degraded' });
    expect(assertNoSensitiveKeys(degraded)).toEqual([]);
  });
});
