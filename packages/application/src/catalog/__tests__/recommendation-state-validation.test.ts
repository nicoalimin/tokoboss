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

const WS = 'ws_rec_state_validation_1';
const NOW = new Date('2026-10-05T00:00:00.000Z');

async function seedVariant(store: InMemoryCatalogStore) {
  const created = await createProduct(store, {
    ctx: member(WS, 'admin'),
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-REC-STATE-VAL-1',
        name: 'Merah / M',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
      },
    ],
  });
  return created.variants[0]!;
}

describe('setRecommendationState validation (Story 11 / UTA-146)', () => {
  it('rejects a snooze date in the past or equal to now with CATALOG_VALIDATION', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'manager');

    await expect(
      setRecommendationState(store, {
        ctx,
        workspaceId: WS,
        variantId: variant.id,
        status: 'snoozed',
        snoozedUntil: new Date('2026-10-01T00:00:00.000Z'),
        expectedVersion: null,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

    await expect(
      setRecommendationState(store, {
        ctx,
        workspaceId: WS,
        variantId: variant.id,
        status: 'snoozed',
        snoozedUntil: new Date(NOW.getTime()),
        expectedVersion: null,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
  });

  it('rejects an unknown status and a bad expectedVersion with CATALOG_VALIDATION', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'manager');

    await expect(
      setRecommendationState(store, {
        ctx,
        workspaceId: WS,
        variantId: variant.id,
        status: 'archived',
        expectedVersion: null,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

    await expect(
      setRecommendationState(store, {
        ctx,
        workspaceId: WS,
        variantId: variant.id,
        status: 'dismissed',
        expectedVersion: 0,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
  });
});
