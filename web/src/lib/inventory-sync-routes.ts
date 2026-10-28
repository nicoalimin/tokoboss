/**
 * Shared Route Handler helpers for inventory-sync routes (US04 / RFC 06
 * task 37a). RFC 02 membership gate (401 / neutral 404) via
 * `admitSkuMappingMember`; Staff → 403 ROLE_FORBIDDEN on writes; strict
 * sync-state wire view; typed errors → 403 / 404 / 400, else a non-leaking 500.
 */
import type { MappingSyncStateView } from '@tokoboss/contracts';
import type { MappingSyncState } from '@tokoboss/application';
import type { TokobossLogger } from '@tokoboss/observability';
import { authJson } from '@/lib/auth-routes';
import {
  admitSkuMappingMember,
  type RouteIds,
  type SkuMappingDenial,
} from '@/lib/sku-mapping-routes';

export type InventorySyncDenial =
  | SkuMappingDenial
  | { status: 403; error: string; errorCode: 'ROLE_FORBIDDEN' };

const EDITOR_DENIAL = {
  status: 403,
  error: 'Hanya Admin atau Manager yang dapat mengatur sinkronisasi stok.',
  errorCode: 'ROLE_FORBIDDEN',
} as const satisfies InventorySyncDenial;

const STATUS: Record<string, number> = {
  ROLE_FORBIDDEN: 403,
  INVENTORY_SYNC_MAPPING_NOT_FOUND: 404,
  INVENTORY_SYNC_VALIDATION: 400,
};

/** Admin / Manager only; Staff → 403 ROLE_FORBIDDEN (before the body). */
export async function requireInventorySyncEditor(
  request: Request,
  workspaceId: string
) {
  const admitted = await admitSkuMappingMember(request, workspaceId);
  if (!admitted.ok) return admitted;
  const { role } = admitted.ctx;
  if (role !== 'admin' && role !== 'manager') {
    return { ok: false as const, denial: EDITOR_DENIAL as InventorySyncDenial };
  }
  return admitted;
}

export function inventorySyncDenied(
  denial: InventorySyncDenial,
  ids: RouteIds
) {
  const { status, error, errorCode } = denial;
  return authJson({ error, errorCode }, status, ...ids);
}

/** Strict wire view of one mapping's sync state (contracts row 18). */
export function toMappingSyncStateView(
  s: MappingSyncState
): MappingSyncStateView {
  return {
    mappingId: s.mappingId,
    variantId: s.variantId,
    connectionId: s.connectionId,
    syncEnabled: s.syncEnabled,
    stockBuffer: s.stockBuffer,
    allocationPct: s.allocationPct,
    syncStatus: s.syncStatus,
    desiredQty: s.desiredQty,
    lastPushedQty: s.lastPushedQty,
    lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
    lastErrorCode: s.lastErrorCode,
    lastErrorMessage: s.lastErrorMessage,
    version: s.version,
  };
}

/** Typed inventory-sync errors → 403 / 404 / 400; anything else → logged 500. */
export function inventorySyncFailed(
  err: unknown,
  ids: RouteIds,
  log?: Pick<TokobossLogger, 'error'>
) {
  const code = String((err as { code?: unknown } | null)?.code ?? '');
  const status = STATUS[code];
  if (status && err instanceof Error) {
    return authJson({ error: err.message, errorCode: code }, status, ...ids);
  }
  log?.error('inventory sync route failed', {
    errorCode: 'INVENTORY_SYNC_FAILED',
  });
  const body = {
    error: 'Inventory sync failed.',
    errorCode: 'INVENTORY_SYNC_FAILED',
  };
  return authJson(body, 500, ...ids);
}
