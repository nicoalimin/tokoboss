/**
 * Hello Workflow (UTA-14) — `web/src/workflows/hello.ts`.
 *
 * One multi-step idempotent Workflow that creates/updates the `jobs` row,
 * records events, survives a forced step failure/retry, and ends in a
 * traceable status with `workflow_run_id` set.
 *
 * Vercel wiring: this module is the step logic behind the `JobExecutor`
 * port. Locally and in preview it runs inline via `LocalHelloExecutor`
 * (`./executor.ts`); in production the same port is implemented by the
 * Vercel Workflow adapter (dispatch = start run, steps resume from the
 * stored row/events). No pg-boss, no persistent worker.
 *
 * Steps (each a documented safe checkpoint except the running claim):
 * 1. `greet` — claim (idempotent by run id) + progress 33.
 * 2. `checkpoint` — progress 66. When `input_ref.failStepOnce` is true and
 *    no `retry` event exists yet, records `waiting` + `retry` and throws
 *    `HelloStepError` so the run visibly fails; the retry (new run id)
 *    observes the `retry` event and proceeds. This is the forced
 *    step-failure/retry acceptance path.
 * 3. `finalize` — `completed` + `output_ref`, progress 100.
 *
 * Resume: re-execution skips steps already reflected in stored progress or
 * events, so duplicate dispatches never duplicate effects.
 */
import {
  assertJobPayloadSafe,
  claimStartJob,
  completeJob,
  failJob,
  readJobTimeline,
  reportJobProgress,
  type JobRecord,
  type JobStore,
} from '@tokoboss/application';

export class HelloStepError extends Error {
  readonly code = 'HELLO_STEP_FAILED';
  constructor(readonly jobId: string) {
    super(`Hello workflow forced step failure for job ${jobId}`);
    this.name = 'HelloStepError';
  }
}

export interface HelloWorkflowInput {
  jobId: string;
  workspaceId: string;
  /** Vercel run id, or `local_<uuid>` for the inline executor. */
  runId: string;
}

const STEP1_PROGRESS = 33;
const STEP2_PROGRESS = 66;

export async function executeHelloJob(
  store: JobStore,
  input: HelloWorkflowInput
): Promise<JobRecord> {
  const { job: claimed, duplicate } = await claimStartJob(store, {
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    workflowRunId: input.runId,
  });
  let job = claimed;

  // Re-entry after a crash between claim and step 1: fall through and let
  // each step's stored-progress check skip completed work.
  void duplicate;

  const timeline = await readJobTimeline(store, {
    jobId: job.id,
    workspaceId: job.workspaceId,
  });
  const eventTypes = new Set(timeline.events.map((e) => e.type));
  const inputRef = job.inputRef ?? {};
  assertJobPayloadSafe(inputRef, 'input_ref');

  // Step 1 — greet.
  if (job.progressCurrent < STEP1_PROGRESS) {
    job = await reportJobProgress(store, {
      jobId: job.id,
      workspaceId: job.workspaceId,
      current: STEP1_PROGRESS,
      note: 'hello: greeted',
    });
  }

  // Step 2 — checkpoint (forced-failure injection for the retry path).
  const failOnce = inputRef['failStepOnce'] === true;
  if (failOnce && !eventTypes.has('retry')) {
    job = await reportJobProgress(store, {
      jobId: job.id,
      workspaceId: job.workspaceId,
      current: STEP2_PROGRESS,
      note: 'hello: checkpoint before forced failure',
    });
    await failJob(store, {
      jobId: job.id,
      workspaceId: job.workspaceId,
      errorCode: 'HELLO_STEP_FAILED',
      errorMessage: 'forced step failure (failStepOnce)',
    });
    throw new HelloStepError(job.id);
  }
  if (job.progressCurrent < STEP2_PROGRESS) {
    job = await reportJobProgress(store, {
      jobId: job.id,
      workspaceId: job.workspaceId,
      current: STEP2_PROGRESS,
      note: 'hello: checkpoint',
    });
  }

  // Step 3 — finalize (the only terminal write; cancel is rejected once
  // running, i.e. past the safe-cancel checkpoint).
  job = await completeJob(store, {
    jobId: job.id,
    workspaceId: job.workspaceId,
    outputRef: { greeting: 'hello', steps: 3 },
  });
  return job;
}
