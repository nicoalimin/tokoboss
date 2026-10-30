import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  toIntegrationCenterKpis,
  toIntegrationCenterStore,
  type IntegrationCenterKpis,
  type IntegrationCenterStore,
} from './integration-center-overview-mappers';
import { assertIntegrationStatusRead } from './integration-guards';
import {
  emptyConnectionMetrics,
  INTEGRATION_ACTIVITY_DEFAULT_LIMIT,
  INTEGRATION_ACTIVITY_MAX_LIMIT,
  type ConnectionOperationalMetricsPort,
  type IntegrationActivityReadsPort,
} from './integration-management-ports';
import type * as ports from './integration-ports';
import { toConnectionView } from './list-connections';
import {
  summarizeIntegrationActivity,
  type IntegrationActivityItem,
} from './list-integration-activity';

/**
 * Integration Center overview (UTA-38 / US18, RFC 07 addendum row 44a2):
 * KPI bar + store health table + activity feed for every active member
 * (Admin, Manager, Staff); other workspace / inactive → tenancy forbidden.
 * Removed stores are hidden; stores without metrics are zero-filled.
 * Activity is newest first, limit clamped to 1..50 (default 20).
 */

export interface GetIntegrationCenterOverviewDeps {
  connections: Pick<ports.ConnectionStore, 'list'>;
  metrics: Pick<ConnectionOperationalMetricsPort, 'getByWorkspace'>;
  activity: IntegrationActivityReadsPort;
  now: () => Date;
}

export interface GetIntegrationCenterOverviewInput {
  workspaceId: string;
  activityLimit?: number;
}

export interface IntegrationCenterOverview {
  kpis: IntegrationCenterKpis;
  stores: IntegrationCenterStore[];
  activity: IntegrationActivityItem[];
}

function clampActivityLimit(limit: number | undefined): number {
  const whole = Math.trunc(limit ?? INTEGRATION_ACTIVITY_DEFAULT_LIMIT);
  if (!Number.isFinite(whole)) return INTEGRATION_ACTIVITY_DEFAULT_LIMIT;
  return Math.min(INTEGRATION_ACTIVITY_MAX_LIMIT, Math.max(1, whole));
}

export async function getIntegrationCenterOverview(
  deps: GetIntegrationCenterOverviewDeps,
  ctx: WorkspaceContext | null,
  input: GetIntegrationCenterOverviewInput
): Promise<IntegrationCenterOverview> {
  assertIntegrationStatusRead(ctx, input.workspaceId);
  const { workspaceId } = input;
  const limit = clampActivityLimit(input.activityLimit);
  const [rows, metricRows, entries] = await Promise.all([
    deps.connections.list(workspaceId),
    deps.metrics.getByWorkspace(workspaceId),
    deps.activity.listByWorkspace({ workspaceId, limit }),
  ]);
  const byId = new Map(metricRows.map((m) => [m.connectionId, m]));
  const now = deps.now();
  const stores = rows
    .filter((row) => !row.removedAt)
    .map((row) =>
      toIntegrationCenterStore(
        toConnectionView(row),
        byId.get(row.id) ?? emptyConnectionMetrics(row.id),
        now
      )
    );
  const activity = entries.map((entry) => ({
    ...entry,
    summary: summarizeIntegrationActivity(entry),
  }));
  return { kpis: toIntegrationCenterKpis(stores), stores, activity };
}
