import type { MarketplaceProvider } from '@tokoboss/domain';

/**
 * Story 18 read ports (UTA-38 / US18, RFC 07 row 10): per-store operational
 * metrics and the integration activity / audit feed. Implemented by the
 * in-memory fake (row 11) and Drizzle (rows 19–20). WIB is web-side.
 */

/** audit_events actions shown on the integration activity feed. */
export const INTEGRATION_ACTIVITY_ACTIONS = [
  'integration.connected',
  'integration.reauthorized',
  'integration.controls_updated',
  'integration.token_refresh_failed',
  'integration.ownership_conflict',
  'integration.disconnected',
  'integration.removed',
  'integration.location_linked',
] as const;
export type IntegrationActivityAction =
  (typeof INTEGRATION_ACTIVITY_ACTIONS)[number];

export function isIntegrationActivityAction(
  value: string
): value is IntegrationActivityAction {
  return (INTEGRATION_ACTIVITY_ACTIONS as readonly string[]).includes(value);
}

/** Feed page size: default 20, max 50 (IntegrationActivityQuerySchema). */
export const INTEGRATION_ACTIVITY_DEFAULT_LIMIT = 20;
export const INTEGRATION_ACTIVITY_MAX_LIMIT = 50;

/** Per-store SKU / sync / order / warehouse summary for one connection. */
export interface ConnectionOperationalMetrics {
  connectionId: string;
  /** catalog_channel_mappings active / archived. */
  mappedSkuCount: number;
  archivedMappedSkuCount: number;
  conflictSkuCount: number;
  rateLimitedSkuCount: number;
  lastStockPushAt: Date | null;
  lastOrderImportAt: Date | null;
  /** marketplace_location_links joined to warehouses (codes sorted). */
  linkedWarehouseCount: number;
  linkedWarehouseCodes: string[];
}

/** Zero metrics for a store with no mappings, syncs, orders or links. */
export function emptyConnectionMetrics(
  connectionId: string
): ConnectionOperationalMetrics {
  return {
    connectionId,
    mappedSkuCount: 0,
    archivedMappedSkuCount: 0,
    conflictSkuCount: 0,
    rateLimitedSkuCount: 0,
    lastStockPushAt: null,
    lastOrderImportAt: null,
    linkedWarehouseCount: 0,
    linkedWarehouseCodes: [],
  };
}

export interface ConnectionOperationalMetricsPort {
  /** Stores with data only; callers zero-fill via emptyConnectionMetrics. */
  getByWorkspace(workspaceId: string): Promise<ConnectionOperationalMetrics[]>;
  getByConnection(
    workspaceId: string,
    connectionId: string
  ): Promise<ConnectionOperationalMetrics>;
}

/** One integration.* audit_events row (tenant = workspace). */
export interface IntegrationActivityEntry {
  id: string;
  workspaceId: string;
  action: IntegrationActivityAction;
  /** From payload.connectionId / provider / storeName; null if absent. */
  connectionId: string | null;
  provider: MarketplaceProvider | null;
  storeName: string | null;
  actorType: string | null;
  actorId: string | null;
  occurredAt: Date;
  payload: Readonly<Record<string, unknown>>;
}

export interface IntegrationActivityListInput {
  workspaceId: string;
  /** Omit for the workspace-wide feed. */
  connectionId?: string;
  /** 1..INTEGRATION_ACTIVITY_MAX_LIMIT; callers clamp. */
  limit: number;
}

export interface IntegrationActivityReadsPort {
  /** Newest first (created_at DESC); only integration.* actions. */
  listByWorkspace(
    input: IntegrationActivityListInput
  ): Promise<IntegrationActivityEntry[]>;
}
