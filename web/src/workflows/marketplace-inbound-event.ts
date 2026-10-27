/**
 * Marketplace inbound-event Workflow (US20 / RFC 04 task 136) —
 * `web/src/workflows/marketplace-inbound-event.ts`.
 *
 * Step logic behind the `JobExecutor` port, like `./hello.ts`: claim the
 * `marketplace.inbound_event` job queued by webhook intake, read
 * `inputRef.eventId`, run `processInboundEvent`, then complete the job.
 * Runs on intake (no cron). A `failed` event result or a thrown error
 * fails the job (retry with backoff until attempts run out); a re-run
 * sees the event is no longer `received` and completes as `skipped`.
 */
import {
  INBOUND_EVENT_JOB_TYPE,
  assertJobPayloadSafe,
  claimStartJob,
  completeJob,
  failJob,
  processInboundEvent,
  type JobRecord,
  type JobStore,
  type ProcessInboundEventDeps,
  type ProcessInboundEventResult,
} from '@tokoboss/application';

export const MARKETPLACE_INBOUND_EVENT_JOB_TYPE = INBOUND_EVENT_JOB_TYPE;

export interface InboundEventWorkflowInput {
  jobId: string;
  workspaceId: string;
  /** Vercel run id, or `local_<uuid>` for the inline executor. */
  runId: string;
}

export async function executeInboundEventJob(
  store: JobStore,
  deps: ProcessInboundEventDeps,
  input: InboundEventWorkflowInput
): Promise<JobRecord> {
  const { job } = await claimStartJob(store, {
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    workflowRunId: input.runId,
  });
  const ref = { jobId: job.id, workspaceId: job.workspaceId };
  const inputRef = job.inputRef ?? {};
  assertJobPayloadSafe(inputRef, 'input_ref');
  const eventId = inputRef['eventId'];
  if (typeof eventId !== 'string' || eventId.length === 0) {
    await failJob(store, { ...ref, errorCode: 'INBOUND_EVENT_INPUT_INVALID' });
    throw new Error(`Inbound event job ${job.id} has no eventId`);
  }
  let status: ProcessInboundEventResult;
  try {
    status = await processInboundEvent(deps, eventId);
  } catch (err) {
    await failJob(store, {
      ...ref,
      errorCode: 'INBOUND_EVENT_STEP_FAILED',
      errorMessage: 'inbound event processing failed',
    });
    throw err;
  }
  if (status === 'failed') {
    return failJob(store, {
      ...ref,
      errorCode: 'INBOUND_EVENT_FAILED',
      errorMessage: 'inbound event could not be applied',
    });
  }
  return completeJob(store, { ...ref, outputRef: { eventId, status } });
}
