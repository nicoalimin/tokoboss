import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import { createProduct } from '../catalog-use-cases';
import { setRecommendationState } from '../recommendation-state-use-cases';

function member(
  workspaceId: string,
  role: WorkspaceContext['role']
): WorkspaceContext {
  return {
    workspaceId,
    userId: `user_${role}_1`,
    role,
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

const WS = 'ws_rec_state_forbidden_1';
const NOW = new Date('2026-10-05T00:00:00.000Z');

async function seedVariant(store: InMemoryCatalogStore) {
  const created = await createProduct(store, {
    ctx: member(WS, 'admin'),
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-REC-STATE-FORB-1',
        name: 'Merah / M',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
      },
    ],
  });
  return created.variants[0]!;
}

describe('setRecommendationState forbidden + conflict (Story 11 / UTA-146)', () => {
  it('rejects staff and cross-workspace callers with TENANCY_FORBIDDEN', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);

    await expect(
      setRecommendationState(store, {
        ctx: member(WS, 'staff'),
        workspaceId: WS,
        variantId: variant.id,
        status: 'dismissed',
        expectedVersion: null,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });

    await expect(
      setRecommendationState(store, {
        ctx: member('ws_other_1', 'admin'),
        workspaceId: WS,
        variantId: variant.id,
        status: 'dismissed',
        expectedVersion: null,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
  });

  it('passes through the store version conflict on a stale expectedVersion', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'admin');

    await setRecommendationState(store, {
      ctx,
      workspaceId: WS,
      variantId: variant.id,
      status: 'dismissed',
      expectedVersion: null,
      now: NOW,
    });

    await expect(
      setRecommendationState(store, {
        ctx,
        workspaceId: WS,
        variantId: variant.id,
        status: 'active',
        expectedVersion: 5,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });
  });
});
