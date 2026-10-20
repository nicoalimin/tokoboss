import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  connectionNotFound,
  integrationValidation,
} from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';
import {
  applyConnectionRemoval,
  type RemoveConnectionTx,
} from './remove-connection-tx';

export interface RemoveConnectionDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  audit: Pick<TenancyAuditSink, 'append'>;
  transaction<T>(fn: (tx: RemoveConnectionTx) => Promise<T>): Promise<T>;
  now(): Date;
}

export interface RemoveConnectionInput {
  workspaceId: string;
  connectionId: string;
}

/**
 * Hapus koneksi (US20 / RFC 04 task 27b). Admin only, from Terputus only.
 * Runs the removal (task 27a) in one transaction, then writes one
 * `integration.removed` audit. Row and history stay.
 */
export async function removeConnection(
  deps: RemoveConnectionDeps,
  ctx: WorkspaceContext | null,
  input: RemoveConnectionInput
): Promise<ConnectionRecord> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;
  const actorId = ctx.userId;
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();
  if (row.status !== 'disconnected') {
    throw integrationValidation('Putuskan koneksi sebelum menghapusnya.');
  }
  const now = deps.now();
  const result = await deps.transaction((tx) =>
    applyConnectionRemoval(tx, { workspaceId, connectionId, row, now })
  );
  await deps.audit.append({
    workspaceId,
    action: 'integration.removed',
    category: 'workspace',
    actorId,
    payload: {
      connectionId,
      provider: row.provider,
      providerStoreId: row.providerStoreId,
      mappingsArchived: result.mappingsArchived,
      claimReleased: result.claimReleased,
    },
  });
  return result.saved;
}
