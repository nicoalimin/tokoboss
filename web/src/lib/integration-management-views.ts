/**
 * Story 18 store health view mappers (UTA-38 / US18, RFC 07 row 23b):
 * health badge + ~30-day token pill, operational metrics and the 5-step
 * setup checklist per store, plus the four Integration Center KPIs. Pure,
 * evaluated at read time (no cron). Activity DTO: integration-activity-views.
 */
import type {
  ConnectionHealthBadgeDto,
  ConnectionOperationalMetricsDto,
  ConnectionSetupChecklistDto,
} from '@tokoboss/contracts';
import type {
  ConnectionOperationalMetrics,
  ConnectionView,
} from '@tokoboss/application';
import {
  CONNECTION_HEALTH_BADGES,
  computeConnectionChecklist,
  evaluateConnectionHealth,
  formatTokenExpiryWindowDays,
} from '@tokoboss/domain';

export interface StoreHealthRowView {
  connection: ConnectionView;
  health: ConnectionHealthBadgeDto;
  metrics: ConnectionOperationalMetricsDto;
  checklist: ConnectionSetupChecklistDto;
}

export interface IntegrationKpiSummary {
  totalStores: number;
  /** Sehat & aktif penuh: healthy, or expiring soon with both on. */
  healthyActiveCount: number;
  pausedCount: number;
  needsReauthCount: number;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toStoreHealthRowView(
  connection: ConnectionView,
  m: ConnectionOperationalMetrics,
  now: Date
): StoreHealthRowView {
  const status = evaluateConnectionHealth(
    { ...connection, rateLimitedSkuCount: m.rateLimitedSkuCount },
    now
  );
  const steps = computeConnectionChecklist({
    status: connection.status,
    health: status,
    inventorySyncEnabled: connection.inventorySyncEnabled,
    capabilities: connection.capabilities,
    linkedWarehouseCount: m.linkedWarehouseCount,
    mappedSkuCount: m.mappedSkuCount,
  });
  return {
    connection,
    health: {
      status,
      ...CONNECTION_HEALTH_BADGES[status],
      tokenExpiryLabel: formatTokenExpiryWindowDays(
        connection.authExpiresAt,
        now
      ),
    },
    metrics: {
      mappedSkuCount: m.mappedSkuCount,
      archivedMappedSkuCount: m.archivedMappedSkuCount,
      conflictSkuCount: m.conflictSkuCount,
      rateLimitedSkuCount: m.rateLimitedSkuCount,
      lastStockPushAt: iso(m.lastStockPushAt),
      lastOrderImportAt: iso(m.lastOrderImportAt),
      linkedWarehouseCount: m.linkedWarehouseCount,
      linkedWarehouseCodes: [...m.linkedWarehouseCodes],
    },
    checklist: steps.map((s) => ({ key: s.key, state: s.state })),
  };
}

export function toIntegrationKpiSummary(
  rows: readonly StoreHealthRowView[]
): IntegrationKpiSummary {
  const count = (...s: string[]) =>
    rows.filter((r) => s.includes(r.health.status)).length;
  return {
    totalStores: rows.length,
    healthyActiveCount: count('healthy', 'expiring_soon'),
    pausedCount: count('paused_partial', 'paused_full'),
    needsReauthCount: count('needs_reauth'),
  };
}
