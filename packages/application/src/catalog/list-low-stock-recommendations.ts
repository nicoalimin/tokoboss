/**
 * List low-stock recommendations (UTA-146 Slice 1b / Story 11).
 * Read-only: ledger available qty + configured min stock → pure heuristic.
 * Sales/order domain does not exist yet → salesRatePerDay always null.
 * Supplier master does not exist yet → missingSupplier always true.
 */

import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import type { CatalogStore } from './catalog-ports';
import {
  buildLowStockRecommendation,
  isBelowMinStock,
  type LowStockRecommendation,
} from './low-stock-recommendation';

export async function listLowStockRecommendations(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string }
): Promise<LowStockRecommendation[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);

  const [variants, products] = await Promise.all([
    store.listVariantsByWorkspace(input.workspaceId),
    store.listProducts(input.workspaceId),
  ]);
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  const out: LowStockRecommendation[] = [];
  for (const variant of variants) {
    if (variant.status === 'archived') continue;
    if (variant.minStockQty == null) continue;

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

    out.push(
      buildLowStockRecommendation({
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
      })
    );
  }

  out.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  return out;
}
