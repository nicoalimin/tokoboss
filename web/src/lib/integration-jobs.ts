/**
 * On-request / on-intake marketplace job runners (US20 / RFC 04 task 140).
 * No crons (Nico 2026-10-23): a job runs inline in the request that queues
 * it. `runConnectionInitialImport` queues via `retryInitialImport` (errors
 * propagate) then runs the job; `runInboundEventJobs` queues one job per
 * webhook event via `enqueueInboundEventJobs` and runs each new job. Runs
 * are best-effort: errors are logged and the job stays retryable.
 */
import {
  enqueueInboundEventJobs,
  retryInitialImport,
  type ConnectionRecord,
  type EnqueueInboundEventJobsResult,
  type NewJobInput,
  type RetryInitialImportResult,
  type WorkspaceContext,
} from '@tokoboss/application';
import type { TokobossLogger } from '@tokoboss/observability';
import { enqueueIntegrationJob, getIntegrationDeps } from '@/lib/integrations';
import { getJobExecutor } from '@/lib/jobs';

type JobLog = Pick<TokobossLogger, 'error'>;

export interface RunConnectionImportResult extends RetryInitialImportResult {
  /** True when the queued import job ran in this request without error. */
  executed: boolean;
  /** The connection re-read after the run (null if it is gone). */
  connection: ConnectionRecord | null;
}

/** Run one job now; log and swallow any error (the job stays retryable). */
async function runJobBestEffort(
  job: { jobId: string; workspaceId: string },
  log?: JobLog
): Promise<boolean> {
  try {
    await getJobExecutor().execute(job);
    return true;
  } catch (err) {
    log?.error('integration job execution failed', {
      jobId: job.jobId,
      errorCode: 'INTEGRATION_JOB_EXECUTION_FAILED',
      error: err instanceof Error ? err.name : 'unknown',
    });
    return false;
  }
}

/** Queue (idempotently) and run the initial import for one connection. */
export async function runConnectionInitialImport(
  ctx: WorkspaceContext | null,
  input: { workspaceId: string; connectionId: string },
  log?: JobLog
): Promise<RunConnectionImportResult> {
  const deps = {
    ...getIntegrationDeps(),
    enqueueImport: enqueueIntegrationJob,
  };
  const result = await retryInitialImport(deps, ctx, input);
  const executed =
    result.jobId !== null && result.status === 'queued'
      ? await runJobBestEffort(
          { jobId: result.jobId, workspaceId: input.workspaceId },
          log
        )
      : false;
  const connection = await deps.connections.find(
    input.workspaceId,
    input.connectionId
  );
  return { ...result, executed, connection };
}

/** Queue one inbound-event job per accepted event and run the new ones. */
export async function runInboundEventJobs(
  eventIds: readonly string[],
  correlationId?: string,
  log?: JobLog
): Promise<EnqueueInboundEventJobsResult & { executed: number }> {
  const queued: { jobId: string; workspaceId: string }[] = [];
  const enqueueJob = async (job: NewJobInput) => {
    const created = await enqueueIntegrationJob(job);
    if (!created.duplicate) {
      queued.push({ jobId: created.job.id, workspaceId: job.workspaceId });
    }
    return created;
  };
  const { events } = getIntegrationDeps();
  const result = await enqueueInboundEventJobs(
    { events, enqueueJob },
    eventIds,
    correlationId
  );
  let executed = 0;
  for (const job of queued) {
    if (await runJobBestEffort(job, log)) executed += 1;
  }
  return { ...result, executed };
}
