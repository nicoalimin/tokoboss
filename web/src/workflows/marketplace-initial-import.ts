/**
 * Marketplace initial-import Workflow (US20 / RFC 04 task 84a) —
 * `web/src/workflows/marketplace-initial-import.ts`.
 *
 * Step logic behind the `JobExecutor` port, like `./hello.ts`: claim the
 * `jobs` row, then loop `runInitialImportStep` (locations → listing pages →
 * order preview → capabilities) from the saved cursor. `sleep` results wait
 * durably (`deps.sleep`; Vercel Workflow sleep in production, a timer
 * locally). The use case stops on a non-connected status (Putuskan during
 * an import), caps rate-limit sleeps at 20 and listings at 10,000.
 * Resume: the cursor is saved after every step and reloaded on re-entry.
 */
import {
  INITIAL_IMPORT_START,
  assertJobPayloadSafe,
  claimStartJob,
  completeJob,
  failJob,
  reportJobProgress,
  runInitialImportStep,
  type InitialImportCursor,
  type JobRecord,
  type JobStore,
  type RunInitialImportDeps,
} from '@tokoboss/application';

export const MARKETPLACE_INITIAL_IMPORT_JOB_TYPE = 'marketplace.initial_import';

/** Guard: 100 listing pages + 20 sleeps + the fixed phases fit easily. */
const MAX_STEPS = 200;

const PHASE_PROGRESS: Record<InitialImportCursor['phase'], number> = {
  locations: 10,
  listings: 40,
  orders: 70,
  capabilities: 90,
};

export interface InitialImportWorkflowDeps extends RunInitialImportDeps {
  /** The `initial_import_cursor` saved by `saveCursor`, if any. */
  loadCursor(connectionId: string): Promise<InitialImportCursor | null>;
  sleep(ms: number): Promise<void>;
}

export interface InitialImportWorkflowInput {
  jobId: string;
  workspaceId: string;
  /** Vercel run id, or `local_<uuid>` for the inline executor. */
  runId: string;
}

export async function executeInitialImportJob(
  store: JobStore,
  deps: InitialImportWorkflowDeps,
  input: InitialImportWorkflowInput
): Promise<JobRecord> {
  const { job } = await claimStartJob(store, {
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    workflowRunId: input.runId,
  });
  const ref = { jobId: job.id, workspaceId: job.workspaceId };
  const inputRef = job.inputRef ?? {};
  assertJobPayloadSafe(inputRef, 'input_ref');
  const connectionId = inputRef['connectionId'];
  if (typeof connectionId !== 'string' || connectionId.length === 0) {
    await failJob(store, { ...ref, errorCode: 'IMPORT_INPUT_INVALID' });
    throw new Error(`Import job ${job.id} has no connectionId`);
  }
  let cursor = (await deps.loadCursor(connectionId)) ?? INITIAL_IMPORT_START;
  let progress = job.progressCurrent;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await runInitialImportStep(deps, {
        workspaceId: job.workspaceId,
        connectionId,
        cursor,
      });
      if (result.kind === 'done') {
        return await completeJob(store, {
          ...ref,
          outputRef: { connectionId, status: result.status },
        });
      }
      cursor = result.cursor;
      const current = PHASE_PROGRESS[cursor.phase];
      if (current > progress) {
        await reportJobProgress(store, { ...ref, current });
        progress = current;
      }
      if (result.kind === 'sleep') await deps.sleep(result.sleepMs);
    }
    throw new Error(`Import job ${job.id} exceeded ${MAX_STEPS} steps`);
  } catch (err) {
    await failJob(store, {
      ...ref,
      errorCode: 'IMPORT_STEP_FAILED',
      errorMessage: 'initial import step failed',
    });
    throw err;
  }
}
