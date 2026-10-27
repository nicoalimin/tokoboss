import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import type { SkuMappingReadStore } from './sku-mapping-ports';
import type { SkuMappingHistoryEntry } from './sku-mapping-types';

export interface ListSkuMappingHistoryInput {
  workspaceId: string;
  /** Optional SKU TokoBoss filter (SkuDrawer / one mapping card). */
  variantId?: string;
  /** Route-validated 1..100; clamped again here, default 50. */
  limit?: number;
}

/** Shown when user_profiles has no display_name (RFC 05 §API 5). */
export const SKU_MAPPING_ACTOR_FALLBACK = 'Anggota tim';

/**
 * Riwayat pemetaan Store SKU (UTA-40 / US03, RFC 05 task 16; AC5).
 *
 * Any active workspace member (Staff included); other workspace →
 * tenancy forbidden. Newest first (createdAt desc, id desc on ties).
 * An unknown variantId returns an empty list, not 404. The actor is
 * shown by display name only; never an email.
 */
export async function listSkuMappingHistory(
  deps: { reads: Pick<SkuMappingReadStore, 'listHistory'> },
  ctx: WorkspaceContext | null,
  input: ListSkuMappingHistoryInput
): Promise<SkuMappingHistoryEntry[]> {
  assertSameWorkspace(ctx, input.workspaceId);
  const { workspaceId } = input;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const variantId = input.variantId?.trim() || undefined;
  const rows = await deps.reads.listHistory({ workspaceId, variantId, limit });
  return rows
    .filter((row) => row.workspaceId === workspaceId)
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    )
    .slice(0, limit)
    .map((row) => ({
      ...row,
      actorDisplayName:
        row.actorDisplayName?.trim() || SKU_MAPPING_ACTOR_FALLBACK,
    }));
}
