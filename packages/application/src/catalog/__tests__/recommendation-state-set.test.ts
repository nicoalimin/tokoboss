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

const WS = 'ws_set_rec_state_1';
const NOW = new Date('2026-10-05T00:00:00.000Z');
const NEXT_WEEK = new Date('2026-10-12T00:00:00.000Z');

async function seedVariant(store: InMemoryCatalogStore) {
  const created = await createProduct(store, {
    ctx: member(WS, 'admin'),
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-REC-STATE-1',
        name: 'Merah / M',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
      },
    ],
  });
  return created.variants[0]!;
}

describe('setRecommendationState set (Story 11 / UTA-146)', () => {
  it('creates a dismissed state at version 1 with null snooze and override', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);

    const rec = await setRecommendationState(store, {
      ctx: member(WS, 'manager'),
      workspaceId: WS,
      variantId: variant.id,
      status: 'dismissed',
      expectedVersion: null,
      now: NOW,
    });

    expect(rec.variantId).toBe(variant.id);
    expect(rec.status).toBe('dismissed');
    expect(rec.snoozedUntil).toBeNull();
    expect(rec.suggestedReorderQtyOverride).toBeNull();
    expect(rec.version).toBe(1);
  });

  it('updates to snoozed with a future date and qty override via CAS', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'admin');

    const first = await setRecommendationState(store, {
      ctx,
      workspaceId: WS,
      variantId: variant.id,
      status: 'active',
      expectedVersion: null,
      now: NOW,
    });
    const second = await setRecommendationState(store, {
      ctx,
      workspaceId: WS,
      variantId: variant.id,
      status: 'snoozed',
      snoozedUntil: NEXT_WEEK,
      suggestedReorderQtyOverride: 25,
      expectedVersion: first.version,
      now: NOW,
    });

    expect(second.status).toBe('snoozed');
    expect(second.snoozedUntil?.getTime()).toBe(NEXT_WEEK.getTime());
    expect(second.suggestedReorderQtyOverride).toBe(25);
    expect(second.version).toBe(2);
  });
});
