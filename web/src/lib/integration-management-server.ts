/**
 * Story 18 server helpers (UTA-38 / US18, RFC 07 row 24b) for the controls
 * and activity routes. Store controls queue the catch-up
 * `marketplace.inventory_sync` job and run it in-request (no crons); a
 * failed run is logged and the job stays retryable. Activity returns wire
 * DTOs with WIB labels.
 */
import type { IntegrationActivityItemDto } from '@tokoboss/contracts';
import {
  listIntegrationActivity,
  updateConnectionControls,
  type ListIntegrationActivityInput,
  type NewJobInput,
  type UpdateConnectionControlsInput,
  type UpdateConnectionControlsResult,
  type WorkspaceContext,
} from '@tokoboss/application';
import type { TokobossLogger } from '@tokoboss/observability';
import { toIntegrationActivityItemDto } from '@/lib/integration-activity-views';
import { getIntegrationActivityReads } from '@/lib/integration-management-reads';
import {
  enqueueIntegrationJob,
  getIntegrationAudit,
  getIntegrationStore,
} from '@/lib/integrations';
import { getJobExecutor } from '@/lib/jobs';

type JobLog = Pick<TokobossLogger, 'error'>;

/** Queue the catch-up sync, then run it now (best-effort, logged). */
async function enqueueAndRunSync(input: NewJobInput, log?: JobLog) {
  const queued = await enqueueIntegrationJob(input);
  if (queued.duplicate) return queued;
  const { id: jobId, workspaceId } = queued.job;
  try {
    await getJobExecutor().execute({ jobId, workspaceId });
  } catch (err) {
    log?.error('integration controls sync failed', {
      jobId,
      errorCode: 'INTEGRATION_CONTROLS_SYNC_FAILED',
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
  return queued;
}

/** Jeda / Lanjutkan (Admin only) wired to the store, audit and job queue. */
export function updateIntegrationConnectionControls(
  ctx: WorkspaceContext | null,
  input: UpdateConnectionControlsInput,
  log?: JobLog
): Promise<UpdateConnectionControlsResult> {
  const deps = {
    connections: getIntegrationStore().connections,
    enqueueSync: (job: NewJobInput) => enqueueAndRunSync(job, log),
    audit: getIntegrationAudit(),
  };
  return updateConnectionControls(deps, ctx, input);
}

/** Log Aktivitas feed (every active member) as wire DTOs. */
export async function listIntegrationActivityItems(
  ctx: WorkspaceContext | null,
  input: ListIntegrationActivityInput
): Promise<{ items: IntegrationActivityItemDto[] }> {
  const deps = {
    connections: getIntegrationStore().connections,
    activity: getIntegrationActivityReads(),
  };
  const { items } = await listIntegrationActivity(deps, ctx, input);
  return { items: items.map((item) => toIntegrationActivityItemDto(item)) };
}
