import type { NewJobInput } from '../jobs/job-types';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  connectionNotFound,
  integrationValidation,
} from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type * as ports from './integration-ports';
import type { InitialImportStatus } from './integration-types';

/** Same value as web `MARKETPLACE_INITIAL_IMPORT_JOB_TYPE` (task 84a). */
export const INITIAL_IMPORT_JOB_TYPE = 'marketplace.initial_import';

export interface RetryInitialImportDeps {
  connections: Pick<ports.ConnectionStore, 'find' | 'update'>;
  /** `createJob` behind `enqueueIntegrationJob` (idempotent on the key). */
  enqueueImport(
    input: NewJobInput
  ): Promise<{ job: { id: string }; duplicate: boolean }>;
}

export interface RetryInitialImportInput {
  workspaceId: string;
  connectionId: string;
}

export interface RetryInitialImportResult {
  connectionId: string;
  jobId: string | null;
  status: InitialImportStatus;
  /** True when an import was already queued or running (no new job). */
  alreadyQueued: boolean;
}

/**
 * Lanjutkan impor / retry the initial import (US20 / RFC 04 task 92a).
 * Admin only. Unknown, removed or other-workspace connection → 404; not
 * connected → 400; already complete → 400. A queued or running import is
 * returned as-is. Otherwise enqueues a `marketplace.initial_import` job
 * (input_ref `{ connectionId }`; the workflow resumes from the saved
 * cursor) and marks the connection `queued` with the new `importJobId`.
 */
export async function retryInitialImport(
  deps: RetryInitialImportDeps,
  ctx: WorkspaceContext | null,
  input: RetryInitialImportInput
): Promise<RetryInitialImportResult> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();
  if (row.status !== 'connected') {
    throw integrationValidation('Impor hanya bisa saat toko terhubung.');
  }
  const current = row.initialImportStatus;
  if (current === 'complete') {
    throw integrationValidation('Impor awal sudah selesai.');
  }
  if (current === 'queued' || current === 'running') {
    const jobId = row.importJobId;
    return { connectionId, jobId, status: current, alreadyQueued: true };
  }

  const { job, duplicate } = await deps.enqueueImport({
    workspaceId,
    type: INITIAL_IMPORT_JOB_TYPE,
    idempotencyKey: `${INITIAL_IMPORT_JOB_TYPE}:${connectionId}:v${row.version}`,
    actorType: 'user',
    actorId: ctx.userId,
    inputRef: { connectionId },
  });
  if (!duplicate) {
    await deps.connections.update({
      workspaceId,
      connectionId,
      expectedVersion: row.version,
      patch: { initialImportStatus: 'queued', importJobId: job.id },
    });
  }
  return {
    connectionId,
    jobId: job.id,
    status: 'queued',
    alreadyQueued: false,
  };
}
