import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { PUT as putRecommendationState } from '../app/api/workspaces/[workspaceId]/catalog/variants/[variantId]/recommendation-state/route';

/**
 * PUT recommendation-state route (UTA-146 slice 1c-vi-c, Story 11)
 * through the memory wiring: first write, CAS update, stale version.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const MANAGER_EMAIL = 'manager@fixture.test';
const MANAGER_PASSWORD = 'manager-noodles-88';

function apiRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

interface RecommendationStateBody {
  recommendationState: {
    variantId: string;
    status: string;
    snoozedUntil: string | null;
    suggestedReorderQtyOverride: number | null;
    version: number;
  };
  errorCode?: string;
}

describe('PUT recommendation-state route (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let managerToken: string;
  let variantId: string;

  async function signInToken(email: string, password: string): Promise<string> {
    const res = await signIn(
      apiRequest('/api/auth/sign-in', {
        email,
        password,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  async function provisionUser(
    email: string,
    role: 'manager' | 'staff',
    password: string
  ): Promise<void> {
    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email, role },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: password })
    );
    expect(accepted.status).toBe(200);
  }

  function put(token: string, body: unknown) {
    return putRecommendationState(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/variants/${variantId}/recommendation-state`,
        body,
        bearer(token),
        'PUT'
      ),
      { params: Promise.resolve({ workspaceId, variantId }) }
    );
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    adminToken = await signInToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    await provisionUser(MANAGER_EMAIL, 'manager', MANAGER_PASSWORD);
    managerToken = await signInToken(MANAGER_EMAIL, MANAGER_PASSWORD);

    const created = await createProduct(
      apiRequest(
        `/api/workspaces/${workspaceId}/catalog/products`,
        {
          name: 'Kaos Polos',
          unit: 'pcs',
          variants: [
            {
              skuCode: 'KAOS-REC-STATE-M',
              name: 'Merah / M',
              sellingPriceCents: 99000,
              hppCents: 45000,
              costSource: 'manual',
            },
          ],
        },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(created.status).toBe(201);
    const { product } = (await created.json()) as {
      product: { variants: Array<{ id: string }> };
    };
    variantId = product.variants[0]?.id ?? '';
  });

  it('Manager first-writes, CAS-updates, and gets 409 on a stale version', async () => {
    const first = await put(managerToken, {
      status: 'dismissed',
      expectedVersion: null,
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as RecommendationStateBody;
    expect(firstBody.recommendationState.variantId).toBe(variantId);
    expect(firstBody.recommendationState.status).toBe('dismissed');
    expect(firstBody.recommendationState.snoozedUntil).toBeNull();
    expect(firstBody.recommendationState.version).toBe(1);

    const updated = await put(managerToken, {
      status: 'active',
      suggestedReorderQtyOverride: 12,
      expectedVersion: 1,
    });
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as RecommendationStateBody;
    expect(updatedBody.recommendationState.status).toBe('active');
    expect(updatedBody.recommendationState.suggestedReorderQtyOverride).toBe(
      12
    );
    expect(updatedBody.recommendationState.version).toBe(2);

    const stale = await put(managerToken, {
      status: 'dismissed',
      expectedVersion: 1,
    });
    expect(stale.status).toBe(409);
    const staleBody = (await stale.json()) as { errorCode: string };
    expect(staleBody.errorCode).toBe('CATALOG_VERSION_CONFLICT');
  });
});
