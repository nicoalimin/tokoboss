/**
 * Recommendation state use-case (UTA-146 Slice 1c / Story 11).
 *
 * Backs dismiss / snooze / edit-suggested-qty on a low-stock
 * recommendation. Manager/Admin only. `expectedVersion` null = first
 * write for this variant (create); number = CAS update. Field-level
 * validation (status, snoozedUntil shape, qty >= 1) is enforced again by
 * the store; this layer adds tenancy, RBAC, and the snooze-in-future rule.
 */

import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import { catalogValidation } from './catalog-errors';
import type { CatalogStore } from './catalog-ports';
import {
  isRecommendationStateStatus,
  type CatalogRecommendationStateRecord,
} from './catalog-types';

export async function setRecommendationState(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    variantId: string;
    status: unknown;
    snoozedUntil?: Date | null;
    suggestedReorderQtyOverride?: number | null;
    expectedVersion: number | null;
    now?: Date;
  }
): Promise<CatalogRecommendationStateRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);

  if (!isRecommendationStateStatus(input.status)) {
    throw catalogValidation(
      `Invalid recommendation status: ${String(input.status)}`
    );
  }

  const snoozedUntil = input.snoozedUntil ?? null;
  if (input.status === 'snoozed') {
    const now = input.now ?? new Date();
    if (
      !(snoozedUntil instanceof Date) ||
      Number.isNaN(snoozedUntil.getTime()) ||
      snoozedUntil.getTime() <= now.getTime()
    ) {
      throw catalogValidation('snoozedUntil must be a future date');
    }
  }

  if (
    input.expectedVersion !== null &&
    (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
  ) {
    throw catalogValidation('expectedVersion must be null or an integer >= 1');
  }

  return store.upsertRecommendationState(
    input.workspaceId,
    input.variantId,
    {
      status: input.status,
      snoozedUntil,
      suggestedReorderQtyOverride: input.suggestedReorderQtyOverride ?? null,
    },
    input.expectedVersion
  );
}
