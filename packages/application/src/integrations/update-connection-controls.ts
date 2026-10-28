import type { NewJobInput } from '../jobs/job-types';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  connectionNotFound,
  integrationValidation,
} from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

/** Same value as web `MARKETPLACE_INVENTORY_SYNC_JOB_TYPE` (RFC 06 task 34). */
export const INVENTORY_SYNC_JOB_TYPE = 'marketplace.inventory_sync';

export interface UpdateConnectionControlsDeps {
  connections: Pick<ports.ConnectionStore, 'find' | 'update'>;
  /** `createJob` behind the web helper (idempotent on the key). */
  enqueueSync(
    input: NewJobInput
  ): Promise<{ job: { id: string }; duplicate: boolean }>;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface UpdateConnectionControlsInput {
  workspaceId: string;
  connectionId: string;
  orderImportEnabled?: boolean;
  inventorySyncEnabled?: boolean;
  reconcileNow?: boolean;
}

export interface UpdateConnectionControlsResult {
  connection: ConnectionRecord;
  reconciliationQueued: boolean;
}

/**
 * Jeda / Lanjutkan store controls (UTA-38 / US18, RFC 07 row 12). Admin
 * only; connected stores only. Saves the flags, queues a catch-up
 * `marketplace.inventory_sync` (`config_change`) when stock sync resumes or
 * `reconcileNow` is asked with sync on, then audits the change.
 */
export async function updateConnectionControls(
  deps: UpdateConnectionControlsDeps,
  ctx: WorkspaceContext | null,
  input: UpdateConnectionControlsInput
): Promise<UpdateConnectionControlsResult> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId, connectionId, reconcileNow } = input;
  const { orderImportEnabled, inventorySyncEnabled } = input;
  const noFlags =
    orderImportEnabled === undefined && inventorySyncEnabled === undefined;
  if (noFlags && reconcileNow !== true) {
    throw integrationValidation('Tidak ada pengaturan yang diubah.');
  }
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();
  if (row.status !== 'connected') {
    throw integrationValidation('Pengaturan hanya bisa saat toko terhubung.');
  }
  const previous = {
    orderImportEnabled: row.orderImportEnabled,
    inventorySyncEnabled: row.inventorySyncEnabled,
  };
  const current = {
    orderImportEnabled: orderImportEnabled ?? previous.orderImportEnabled,
    inventorySyncEnabled: inventorySyncEnabled ?? previous.inventorySyncEnabled,
  };
  const saved = await deps.connections.update({
    workspaceId,
    connectionId,
    expectedVersion: row.version,
    patch: current,
  });
  const resumed =
    !previous.inventorySyncEnabled && current.inventorySyncEnabled;
  let reconciliationQueued = false;
  if (resumed || (reconcileNow === true && current.inventorySyncEnabled)) {
    // Saved version keeps each resume/reconcile its own job (unique key).
    const { duplicate } = await deps.enqueueSync({
      workspaceId,
      type: INVENTORY_SYNC_JOB_TYPE,
      idempotencyKey: `inventory-sync:reconcile:${connectionId}:v${saved.version}`,
      actorType: 'user',
      actorId: ctx.userId,
      inputRef: { workspaceId, connectionId, trigger: 'config_change' },
    });
    reconciliationQueued = !duplicate;
  }
  const { provider, providerStoreId, storeName } = row;
  const store = { connectionId, provider, providerStoreId, storeName };
  await deps.audit.append({
    workspaceId,
    action: 'integration.controls_updated',
    category: 'workspace',
    actorType: 'user',
    actorId: ctx.userId,
    payload: { ...store, previous, current, reconciliationQueued },
  });
  return { connection: saved, reconciliationQueued };
}
