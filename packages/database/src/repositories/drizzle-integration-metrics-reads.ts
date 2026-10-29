import {
  emptyConnectionMetrics,
  type ConnectionOperationalMetrics,
  type ConnectionOperationalMetricsPort,
} from '@tokoboss/application';
import { selectIntegrationMetricRows } from './drizzle-integration-metrics-queries';
import type { DbOrTx } from './drizzle-inventory-sync-scope';

/**
 * Postgres-backed ConnectionOperationalMetricsPort (UTA-38 / US18, RFC 07
 * row 19b): merges the grouped rows from row 19a per connection. Workspace
 * reads return only stores with data; callers zero-fill via
 * emptyConnectionMetrics. One store with no data reads as zeros.
 */
export class DrizzleIntegrationMetricsReads implements ConnectionOperationalMetricsPort {
  constructor(private readonly db: DbOrTx) {}

  getByWorkspace(workspaceId: string) {
    return this.load(workspaceId);
  }

  async getByConnection(workspaceId: string, connectionId: string) {
    const [row] = await this.load(workspaceId, connectionId);
    return row ?? emptyConnectionMetrics(connectionId);
  }

  private async load(
    workspaceId: string,
    connectionId?: string
  ): Promise<ConnectionOperationalMetrics[]> {
    const { maps, syncs, orders, links } = await selectIntegrationMetricRows(
      this.db,
      workspaceId,
      connectionId
    );
    const out = new Map<string, ConnectionOperationalMetrics>();
    const at = (id: string) => {
      const row = out.get(id) ?? emptyConnectionMetrics(id);
      out.set(id, row);
      return row;
    };
    for (const r of maps) {
      const row = at(r.id);
      row.mappedSkuCount = r.active;
      row.archivedMappedSkuCount = r.archived;
    }
    for (const r of syncs) {
      const row = at(r.id);
      row.conflictSkuCount = r.conflict;
      row.rateLimitedSkuCount = r.rateLimited;
      row.lastStockPushAt = r.lastPush;
    }
    for (const r of orders) at(r.id).lastOrderImportAt = r.last;
    for (const r of links) {
      const row = at(r.id);
      row.linkedWarehouseCodes.push(r.code);
      row.linkedWarehouseCount = row.linkedWarehouseCodes.length;
    }
    return [...out.values()];
  }
}
