import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import {
  skuMappingAlreadyAssigned,
  skuMappingForbidden,
  skuMappingNotFound,
  skuMappingValidation,
  skuMappingVariantArchived,
} from './sku-mapping-errors';
import type {
  MappableListingRecord,
  MappableVariantRecord,
} from './sku-mapping-port-inputs';
import type { SkuMappingReadStore } from './sku-mapping-ports';
import type { SkuMappingRecord } from './sku-mapping-types';

/**
 * Input + guards for mapStoreSku (UTA-40 / US03, RFC 05 task 13a). Write
 * builders: map-store-sku-writes.ts (13b); use case: map-store-sku.ts (13c).
 */

export interface MapStoreSkuInput {
  workspaceId: string;
  variantId: string;
  listingId: string;
  source?: 'manual' | 'suggested_single';
  allowRemap?: boolean;
  /** Required when allowRemap is true (MapStoreSkuBodySchema). */
  expectedVersion?: number;
  correlationId?: string;
}

/** Same workspace, then Admin/Manager only; Staff → 403. */
export function assertSkuMappingWrite(
  ctx: WorkspaceContext | null,
  workspaceId: string
): asserts ctx is WorkspaceContext {
  assertSameWorkspace(ctx, workspaceId);
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    throw skuMappingForbidden();
  }
}

/** Active variant + staged listing of a connected store (404/422/400). */
export async function loadMapTargets(
  reads: Pick<SkuMappingReadStore, 'findVariant' | 'findListing'>,
  input: Pick<MapStoreSkuInput, 'workspaceId' | 'variantId' | 'listingId'>
): Promise<{ variant: MappableVariantRecord; listing: MappableListingRecord }> {
  const variant = await reads.findVariant(input.workspaceId, input.variantId);
  if (!variant) throw skuMappingNotFound('SKU TokoBoss');
  if (variant.status !== 'active' || variant.archivedAt) {
    throw skuMappingVariantArchived(variant.id);
  }
  const listing = await reads.findListing(input.workspaceId, input.listingId);
  if (!listing) throw skuMappingNotFound('Store SKU');
  if (!listing.connectionConnected) {
    throw skuMappingValidation('store is not connected');
  }
  return { variant, listing };
}

/** Repoint guard: allowRemap → 409 with owner; expectedVersion → 400. */
export async function assertRemapAllowed(
  reads: Pick<SkuMappingReadStore, 'findVariant'>,
  existing: SkuMappingRecord,
  input: Pick<
    MapStoreSkuInput,
    'workspaceId' | 'allowRemap' | 'expectedVersion'
  >
): Promise<void> {
  if (input.allowRemap !== true) {
    const owner = await reads.findVariant(
      input.workspaceId,
      existing.variantId
    );
    throw skuMappingAlreadyAssigned(
      existing.variantId,
      owner?.skuCode ?? null,
      existing.version
    );
  }
  if (input.expectedVersion === undefined) {
    throw skuMappingValidation('expectedVersion is required to remap');
  }
}
