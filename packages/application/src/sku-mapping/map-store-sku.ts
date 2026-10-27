import { assertTenancyPayloadSafe } from '../tenancy/tenancy-safety';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertRemapAllowed,
  assertSkuMappingWrite,
  loadMapTargets,
  type MapStoreSkuInput,
} from './map-store-sku-guards';
import {
  buildMapAudit,
  buildMappingEvent,
  buildUpsertInput,
  storeSkuKeyOf,
} from './map-store-sku-writes';
import type { SkuMappingDeps } from './sku-mapping-ports';
import type { SkuMappingRecord } from './sku-mapping-types';

export type MapStoreSkuOutcome =
  'mapped' | 'remapped' | 'restored' | 'unchanged';

export interface MapStoreSkuResult {
  mapping: SkuMappingRecord;
  outcome: MapStoreSkuOutcome;
  /** true → 201 Created (new or restored); false → 200 (remap/idempotent). */
  created: boolean;
}

/**
 * Petakan satu Store SKU ke SKU TokoBoss (UTA-40 / US03, RFC 05 task 13c).
 * Admin/Manager only. Same variant → idempotent hint refresh; another
 * variant needs allowRemap + expectedVersion (409 ALREADY_ASSIGNED /
 * CATALOG_VERSION_CONFLICT). Mapping, listing state and history commit in
 * one transaction; audits sku_mapping.mapped | sku_mapping.remapped.
 */
export async function mapStoreSku(
  deps: SkuMappingDeps,
  ctx: WorkspaceContext | null,
  input: MapStoreSkuInput
): Promise<MapStoreSkuResult> {
  assertSkuMappingWrite(ctx, input.workspaceId);
  const { workspaceId, variantId } = input;
  const { listing } = await loadMapTargets(deps.reads, input);
  const key = storeSkuKeyOf(workspaceId, listing);
  const source = input.source ?? 'manual';

  const result = await deps.tx.run(async (store) => {
    const existing = await store.findMappingByStoreSku(key);
    const remap = existing !== null && existing.variantId !== variantId;
    if (remap) await assertRemapAllowed(deps.reads, existing, input);
    const { mapping } = await store.upsertMapping(
      buildUpsertInput(
        key,
        listing,
        variantId,
        ctx.userId,
        remap ? input.expectedVersion : undefined
      )
    );
    await store.setListingMapped(workspaceId, listing.listingId);
    if (existing && !remap) return { mapping, outcome: 'unchanged' as const };

    // No live row before: version 1 is a first map, >1 an archived restore.
    const outcome: MapStoreSkuOutcome = remap
      ? 'remapped'
      : mapping.version > 1
        ? 'restored'
        : 'mapped';
    const previousVariantId = remap ? existing.variantId : null;
    await store.appendHistoryEvent(
      buildMappingEvent(
        mapping,
        listing,
        outcome,
        previousVariantId,
        { actorId: ctx.userId, source },
        input.correlationId
      )
    );
    return { mapping, outcome, previousVariantId };
  });

  const { mapping, outcome } = result;
  if (outcome !== 'unchanged') {
    const prev = result.previousVariantId;
    const audit = buildMapAudit(outcome, mapping, listing, prev, source);
    assertTenancyPayloadSafe(audit.payload, 'sku_mapping');
    await deps.audit.append({
      workspaceId,
      category: 'workspace',
      actorId: ctx.userId,
      correlationId: input.correlationId,
      ...audit,
    });
  }
  const created = outcome === 'mapped' || outcome === 'restored';
  return { mapping, outcome, created };
}
