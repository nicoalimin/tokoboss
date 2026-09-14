/**
 * Executor adapters behind the application `JobExecutor` port (UTA-14).
 *
 * `LocalHelloExecutor` runs the hello Workflow inline in the Route Handler
 * (local dev + preview). Production wires a Vercel Workflow adapter behind
 * the same interface: `execute` starts (or resumes) the run and returns its
 * run id; the steps themselves are `executeHelloJob`, which resumes from
 * the stored row/events either way.
 */
import type { JobExecutor, JobStore } from '@tokoboss/application';
import { executeHelloJob, type HelloWorkflowInput } from './hello';

export function newRunId(prefix = 'local'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createLocalHelloExecutor(
  resolveStore: () => Promise<JobStore> | JobStore,
  runPrefix = 'local'
): JobExecutor {
  return {
    async execute(input: { jobId: string; workspaceId: string }) {
      const store = await resolveStore();
      const workflowInput: HelloWorkflowInput = {
        jobId: input.jobId,
        workspaceId: input.workspaceId,
        runId: newRunId(runPrefix),
      };
      const job = await executeHelloJob(store, workflowInput);
      const runId = job.workflowRunId;
      if (!runId) throw new Error('Hello workflow did not set workflow_run_id');
      return { workflowRunId: runId };
    },
  };
}
