import {
  computeConnectionChecklist,
  evaluateConnectionHealth,
  type ConnectionChecklistStep,
  type ConnectionHealthStatus,
} from '@tokoboss/domain';
import type { ConnectionOperationalMetrics } from './integration-management-ports';
import type { ConnectionView } from './integration-types';

/**
 * Integration Center overview mappers (UTA-38 / US18, RFC 07 addendum row
 * 44a1): one store health row (health evaluated at read time, no cron, plus
 * the 5-step setup checklist) and the four KPI counts. Pure; the use case
 * (44a2) supplies zero-filled metrics and one shared `now`.
 * healthyActiveCount = healthy + expiring_soon (matches the web KPI bar).
 */

export interface IntegrationCenterStore {
  connection: ConnectionView;
  metrics: ConnectionOperationalMetrics;
  health: ConnectionHealthStatus;
  checklist: ConnectionChecklistStep[];
}

export interface IntegrationCenterKpis {
  totalStores: number;
  healthyActiveCount: number;
  pausedCount: number;
  needsReauthCount: number;
}

export function toIntegrationCenterStore(
  connection: ConnectionView,
  metrics: ConnectionOperationalMetrics,
  now: Date
): IntegrationCenterStore {
  const health = evaluateConnectionHealth(
    { ...connection, rateLimitedSkuCount: metrics.rateLimitedSkuCount },
    now
  );
  const checklist = computeConnectionChecklist({
    status: connection.status,
    health,
    inventorySyncEnabled: connection.inventorySyncEnabled,
    capabilities: connection.capabilities,
    linkedWarehouseCount: metrics.linkedWarehouseCount,
    mappedSkuCount: metrics.mappedSkuCount,
  });
  return { connection, metrics, health, checklist };
}

export function toIntegrationCenterKpis(
  stores: readonly IntegrationCenterStore[]
): IntegrationCenterKpis {
  const count = (...statuses: ConnectionHealthStatus[]) =>
    stores.filter((s) => statuses.includes(s.health)).length;
  return {
    totalStores: stores.length,
    healthyActiveCount: count('healthy', 'expiring_soon'),
    pausedCount: count('paused_partial', 'paused_full'),
    needsReauthCount: count('needs_reauth'),
  };
}
