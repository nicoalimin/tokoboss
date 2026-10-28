import {
  emptyConnectionMetrics,
  type ConnectionOperationalMetrics,
  type ConnectionOperationalMetricsPort,
  type IntegrationActivityEntry,
  type IntegrationActivityListInput,
  type IntegrationActivityReadsPort,
} from './integration-management-ports';

/**
 * In-memory Story 18 read fakes (UTA-38 / US18, RFC 07 row 11) for
 * deterministic application and route unit tests. Seed with `setMetrics`
 * and `record`; reads return copies so callers cannot mutate the fake.
 */

type MetricsSeed = Partial<ConnectionOperationalMetrics> & {
  connectionId: string;
};

function copyMetrics(
  row: ConnectionOperationalMetrics
): ConnectionOperationalMetrics {
  return { ...row, linkedWarehouseCodes: [...row.linkedWarehouseCodes] };
}

export class InMemoryIntegrationMetricsReads implements ConnectionOperationalMetricsPort {
  private readonly byWorkspace = new Map<
    string,
    Map<string, ConnectionOperationalMetrics>
  >();

  /** Upserts one store's metrics; omitted fields keep their value (or 0). */
  setMetrics(workspaceId: string, seed: MetricsSeed): void {
    const rows = this.byWorkspace.get(workspaceId) ?? new Map();
    const base = rows.get(seed.connectionId);
    const next = { ...(base ?? emptyConnectionMetrics(seed.connectionId)) };
    rows.set(seed.connectionId, copyMetrics({ ...next, ...seed }));
    this.byWorkspace.set(workspaceId, rows);
  }

  async getByWorkspace(
    workspaceId: string
  ): Promise<ConnectionOperationalMetrics[]> {
    const rows = this.byWorkspace.get(workspaceId);
    return rows ? [...rows.values()].map(copyMetrics) : [];
  }

  async getByConnection(
    workspaceId: string,
    connectionId: string
  ): Promise<ConnectionOperationalMetrics> {
    const row = this.byWorkspace.get(workspaceId)?.get(connectionId);
    return copyMetrics(row ?? emptyConnectionMetrics(connectionId));
  }
}

export class InMemoryIntegrationActivityReads implements IntegrationActivityReadsPort {
  private readonly entries: IntegrationActivityEntry[] = [];

  record(entry: IntegrationActivityEntry): void {
    this.entries.push({ ...entry, payload: { ...entry.payload } });
  }

  /** Newest first; ties keep the later-recorded entry first. */
  async listByWorkspace(
    input: IntegrationActivityListInput
  ): Promise<IntegrationActivityEntry[]> {
    const { workspaceId, connectionId, limit } = input;
    return this.entries
      .map((entry, seq) => ({ entry, seq }))
      .filter(
        ({ entry }) =>
          entry.workspaceId === workspaceId &&
          (connectionId === undefined || entry.connectionId === connectionId)
      )
      .sort(
        (a, b) =>
          b.entry.occurredAt.getTime() - a.entry.occurredAt.getTime() ||
          b.seq - a.seq
      )
      .slice(0, limit)
      .map(({ entry }) => ({ ...entry, payload: { ...entry.payload } }));
  }
}
