import { describe, expect, it, vi } from 'vitest';
import type {
  RecommendationStateView,
  SetRecommendationStateBody,
} from '@tokoboss/contracts';
import {
  ReplenishClientError,
  setRecommendationState,
} from '../lib/replenish-client';

/**
 * Story 11 replenish browser client (UTA-147 slice 2d): PUT dismiss /
 * snooze / edit-qty recommendation state over cookies, with client-safe
 * error mapping.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch;
}

const STATE: RecommendationStateView = {
  id: 'rs1',
  workspaceId: 'ws 1',
  variantId: 'v/1',
  status: 'snoozed',
  snoozedUntil: '2026-10-20T00:00:00.000Z',
  suggestedReorderQtyOverride: 24,
  version: 2,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T01:00:00.000Z',
};

describe('replenish-client setRecommendationState (UTA-147 slice 2d)', () => {
  it('PUTs the JSON body over cookies and returns the saved state', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return jsonResponse({ recommendationState: STATE }, 200);
    });
    const body: SetRecommendationStateBody = {
      status: 'snoozed',
      snoozedUntil: '2026-10-20T00:00:00.000Z',
      suggestedReorderQtyOverride: 24,
      expectedVersion: 1,
    };

    await expect(
      setRecommendationState('ws 1', 'v/1', body, fetchFn)
    ).resolves.toEqual(STATE);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe(
      '/api/workspaces/ws%201/catalog/variants/v%2F1/recommendation-state'
    );
    expect(seen[0]?.[1]).toMatchObject({
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(seen[0]?.[1]?.body))).toEqual(body);
  });

  it('maps conflicts and expired sessions to client-safe errors', async () => {
    const body: SetRecommendationStateBody = {
      status: 'dismissed',
      expectedVersion: 3,
    };

    const conflict = stubFetch(async () =>
      jsonResponse(
        { errorCode: 'VERSION_CONFLICT', detail: 'SKU-RAHASIA-01 v3' },
        409
      )
    );
    const err = await setRecommendationState('ws', 'v1', body, conflict).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ReplenishClientError);
    expect(err).toMatchObject({
      status: 409,
      errorCode: 'VERSION_CONFLICT',
      needsReauth: false,
      message: 'Data sudah diubah orang lain. Muat ulang lalu coba lagi.',
    });
    expect((err as Error).message).not.toContain('SKU-RAHASIA-01');

    const expired = stubFetch(async () =>
      jsonResponse({ errorCode: 'INVALID_SESSION' }, 401)
    );
    await expect(
      setRecommendationState('ws', 'v1', body, expired)
    ).rejects.toMatchObject({ status: 401, needsReauth: true });
  });
});
