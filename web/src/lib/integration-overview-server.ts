/**
 * Integration Center overview server helper (UTA-38 / US18, RFC 07 addendum
 * row 44f) for GET /api/workspaces/[workspaceId]/integrations/overview.
 * Wires the use case to the connection store and the Story 18 read
 * adapters, then shapes the wire DTO with the existing view mappers (one
 * shared `now`, WIB activity labels). Health is computed on request.
 * Dates serialize as ISO strings (`IntegrationCenterOverviewResponse`).
 */
import type { IntegrationActivityItemDto } from '@tokoboss/contracts';
import {
  getIntegrationCenterOverview,
  type WorkspaceContext,
} from '@tokoboss/application';
import { toIntegrationActivityItemDto } from '@/lib/integration-activity-views';
import {
  getIntegrationActivityReads,
  getIntegrationMetricsReads,
} from '@/lib/integration-management-reads';
import {
  toStoreHealthRowView,
  type IntegrationKpiSummary,
  type StoreHealthRowView,
} from '@/lib/integration-management-views';
import { getIntegrationStore } from '@/lib/integrations';

export interface IntegrationCenterOverviewView {
  kpis: IntegrationKpiSummary;
  stores: StoreHealthRowView[];
  activity: IntegrationActivityItemDto[];
}

/** KPI bar + store health table + activity feed (every active member). */
export async function loadIntegrationCenterOverview(
  ctx: WorkspaceContext | null,
  workspaceId: string
): Promise<IntegrationCenterOverviewView> {
  const now = new Date();
  const deps = {
    connections: getIntegrationStore().connections,
    metrics: getIntegrationMetricsReads(),
    activity: getIntegrationActivityReads(),
    now: () => now,
  };
  const overview = await getIntegrationCenterOverview(deps, ctx, {
    workspaceId,
  });
  return {
    kpis: overview.kpis,
    stores: overview.stores.map((store) =>
      toStoreHealthRowView(store.connection, store.metrics, now)
    ),
    activity: overview.activity.map((item) =>
      toIntegrationActivityItemDto(item)
    ),
  };
}
