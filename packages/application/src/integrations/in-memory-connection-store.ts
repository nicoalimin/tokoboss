import { deriveCapabilities } from '@tokoboss/domain';
import type {
  ConnectionPatch,
  ConnectionRecord,
  UpsertConnectionInput,
} from './integration-port-inputs';
import type { ConnectionStore } from './integration-ports';

/**
 * In-memory ConnectionStore test fake (US20, RFC 04 task 34a). Mirrors
 * SQL: (workspace, provider, store id) is unique, removed rows are still
 * returned (use cases filter them), `update` throws on a stale version.
 */
export class InMemoryConnectionStore implements ConnectionStore {
  readonly rows = new Map<string, ConnectionRecord>();
  private seq = 0;

  async find(workspaceId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.workspaceId === workspaceId ? { ...row } : null;
  }

  async findByStore(input: {
    workspaceId: string;
    provider: ConnectionRecord['provider'];
    providerStoreId: string;
  }) {
    const row = [...this.rows.values()].find(
      (r) =>
        r.workspaceId === input.workspaceId &&
        r.provider === input.provider &&
        r.providerStoreId === input.providerStoreId
    );
    return row ? { ...row } : null;
  }

  async list(workspaceId: string) {
    return [...this.rows.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => ({ ...r }));
  }

  async listExpiring(before: Date) {
    return [...this.rows.values()]
      .filter((r) => r.status === 'connected' && r.authExpiresAt !== null)
      .filter((r) => (r.authExpiresAt as Date) < before)
      .map((r) => ({ ...r }));
  }

  async listRefreshDue(before: Date) {
    return [...this.rows.values()]
      .filter((r) => r.status === 'connected')
      .filter((r) => r.connectMode === 'oauth_redirect')
      .filter((r) => r.accessTokenExpiresAt !== null)
      .filter((r) => (r.accessTokenExpiresAt as Date) < before)
      .map((r) => ({ ...r }));
  }

  async upsert(input: UpsertConnectionInput) {
    const { shop, ...rest } = input;
    const prev = await this.findByStore({ ...input, ...shop });
    const row: ConnectionRecord = {
      ...(prev ?? emptyConnection(`conn-${++this.seq}`)),
      ...rest,
      ...shop,
      status: 'connected',
      disconnectSource: null,
      disconnectedAt: null,
      disconnectedBy: null,
      removedAt: null,
      version: (prev?.version ?? 0) + 1,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async update(input: {
    workspaceId: string;
    connectionId: string;
    expectedVersion: number;
    patch: ConnectionPatch;
  }) {
    const row = await this.find(input.workspaceId, input.connectionId);
    if (!row || row.version !== input.expectedVersion) {
      throw new Error(`stale connection version: ${input.connectionId}`);
    }
    const next = { ...row, ...input.patch, version: row.version + 1 };
    this.rows.set(next.id, next);
    return { ...next };
  }
}

/** Columns the upsert input does not carry, at their SQL defaults. */
function emptyConnection(id: string) {
  return {
    id,
    capabilities: deriveCapabilities({}),
    missingPermissions: [],
    lastCheckedAt: null,
    lastErrorCode: null,
    orderImportEnabled: false,
    inventorySyncEnabled: false,
    initialImportStatus: null,
    lastRefreshedAt: null,
    importJobId: null,
  };
}
