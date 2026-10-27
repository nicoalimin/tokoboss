/**
 * Executor adapters behind the application `JobExecutor` port (UTA-14).
 *
 * `LocalHelloExecutor` runs the hello Workflow inline in the Route Handler
 * (local dev + preview). Production wires a Vercel Workflow adapter behind
 * the same interface: `execute` starts (or resumes) the run and returns its
 * run id; the steps themselves are `executeHelloJob`, which resumes from
 * the stored row/events either way.
 */
import {
  HELLO_JOB_TYPE,
  type JobExecutor,
  type JobRecord,
  type JobStore,
} from '@tokoboss/application';
import { executeHelloJob, type HelloWorkflowInput } from './hello';

/** Runs one job type (task 138); same input shape as the hello Workflow. */
export type JobHandler = (
  store: JobStore,
  input: HelloWorkflowInput
) => Promise<JobRecord>;

/** Non-hello handlers by `job.type`, injected by `lib/jobs.ts` (task 139). */
export type JobHandlers = Partial<Record<string, JobHandler>>;

export function newRunId(prefix = 'local'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createLocalHelloExecutor(
  resolveStore: () => Promise<JobStore> | JobStore,
  runPrefix = 'local',
  handlers: JobHandlers = {}
): JobExecutor {
  return {
    async execute(input: { jobId: string; workspaceId: string }) {
      const store = await resolveStore();
      const workflowInput: HelloWorkflowInput = {
        jobId: input.jobId,
        workspaceId: input.workspaceId,
        runId: newRunId(runPrefix),
      };
      const row = await store.findById(input.jobId, input.workspaceId);
      if (!row) throw new Error(`Job ${input.jobId} not found`);
      const run =
        row.type === HELLO_JOB_TYPE ? executeHelloJob : handlers[row.type];
      if (!run) throw new Error(`No executor for job type ${row.type}`);
      const job = await run(store, workflowInput);
      const runId = job.workflowRunId;
      if (!runId) throw new Error('Hello workflow did not set workflow_run_id');
      return { workflowRunId: runId };
    },
  };
}
