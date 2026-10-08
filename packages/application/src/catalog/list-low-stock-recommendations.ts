/**
 * List low-stock recommendations (UTA-146 Slice 1b / Story 11).
 * Read-only: ledger available qty + configured min stock → pure heuristic.
 * Sales/order domain does not exist yet → salesRatePerDay always null.
 * Supplier master does not exist yet → missingSupplier always true.
 * Slice 1e-v: units on open (sent, not yet received) transfers are passed
 * to the heuristic as inTransitQty so units already on the way reduce the
 * suggested reorder qty.
 * Slice 1f-ix: the variant's configured maxStockQty (null when unset) is
 * passed to the heuristic so the suggestion never pushes stock above it.
 * Slice 1g-i: a variant whose recommendation was dismissed, or snoozed
 * until a time still in the future, is left out of the list.
 * Slice 1g-ii: when the seller edited the suggested qty
 * (suggestedReorderQtyOverride), that qty replaces the computed suggestion
 * and an explainability line says so.
 * Slice 1h-i: a bundle variant holds no direct stock (its availability is
 * derived from its components), so it is left out of the list instead of
 * always looking empty; its component SKUs are recommended on their own.
 */

import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import type { CatalogStore, TransferStore } from './catalog-ports';
import { sumInTransitQtyByVariant } from './in-transit-qty';
import {
  buildLowStockRecommendation,
  isBelowMinStock,
  type LowStockRecommendation,
} from './low-stock-recommendation';

export async function listLowStockRecommendations(
  store: CatalogStore & Pick<TransferStore, 'listTransfersWithItems'>,
  input: { ctx: WorkspaceContext; workspaceId: string; now?: Date }
): Promise<LowStockRecommendation[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const now = input.now ?? new Date();

  const [variants, products, transfers] = await Promise.all([
    store.listVariantsByWorkspace(input.workspaceId),
    store.listProducts(input.workspaceId),
    store.listTransfersWithItems(input.workspaceId),
  ]);
  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const inTransitByVariant = sumInTransitQtyByVariant(transfers);

  const out: LowStockRecommendation[] = [];
  for (const variant of variants) {
    if (variant.status === 'archived') continue;
    if (variant.minStockQty == null) continue;
    if (await store.isBundleVariant(input.workspaceId, variant.id)) continue;

    const levels = await store.listLevelsByVariant(
      input.workspaceId,
      variant.id
    );
    const availableQty = levels.reduce((sum, level) => sum + level.qty, 0);
    if (
      !isBelowMinStock({
        availableQty,
        minStockQty: variant.minStockQty,
      })
    ) {
      continue;
    }

    const state = await store.findRecommendationState(
      input.workspaceId,
      variant.id
    );
    if (state?.status === 'dismissed') continue;
    if (
      state?.status === 'snoozed' &&
      state.snoozedUntil !== null &&
      state.snoozedUntil.getTime() > now.getTime()
    ) {
      continue;
    }

    const recommendation = buildLowStockRecommendation({
      variantId: variant.id,
      workspaceId: variant.workspaceId,
      skuCode: variant.skuCode,
      productName: productNameById.get(variant.productId) ?? '',
      variantName: variant.name,
      availableQty,
      minStockQty: variant.minStockQty,
      leadTimeDays: variant.leadTimeDays ?? null,
      salesRatePerDay: null,
      missingSupplier: true,
      missingHpp: variant.hppCents == null,
      inTransitQty: inTransitByVariant.get(variant.id) ?? 0,
      maxStockQty: variant.maxStockQty ?? null,
    });
    const override = state?.suggestedReorderQtyOverride ?? null;
    if (override !== null) {
      recommendation.suggestedReorderQty = override;
      recommendation.explainability.push(
        `Jumlah saran diubah penjual: ${override} unit`
      );
    }
    out.push(recommendation);
  }

  out.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  return out;
}
