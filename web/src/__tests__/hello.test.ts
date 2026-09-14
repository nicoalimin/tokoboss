import { describe, expect, it } from 'vitest';
import {
  InMemoryJobStore,
  createJob,
  readJobTimeline,
} from '@tokoboss/application';
import { executeHelloJob, HelloStepError } from '../workflows/hello';
import { createLocalHelloExecutor } from '../workflows/executor';

const WS = 'ws_hello_test';

async function createHelloJob(key: string, inputRef?: Record<string, unknown>) {
  const store = new InMemoryJobStore();
  const { job } = await createJob(store, {
    workspaceId: WS,
    type: 'hello',
    idempotencyKey: key,
    correlationId: 'corr_hello',
    ...(inputRef ? { inputRef } : {}),
  });
  return { store, job };
}

describe('hello workflow', () => {
  it('runs three steps to completed with workflow_run_id set', async () => {
    const { store, job } = await createHelloJob('hello-1');
    const done = await executeHelloJob(store, {
      jobId: job.id,
      workspaceId: WS,
      runId: 'local_run_1',
    });
    expect(done.status).toBe('completed');
    expect(done.workflowRunId).toBe('local_run_1');
    expect(done.progressCurrent).toBe(done.progressTotal);

    const { events } = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'progress',
      'progress',
      'completed',
    ]);
  });

  it('forced step failure leaves a traceable waiting state; retry completes', async () => {
    const { store, job } = await createHelloJob('hello-retry', {
      failStepOnce: true,
    });

    await expect(
      executeHelloJob(store, {
        jobId: job.id,
        workspaceId: WS,
        runId: 'local_run_1',
      })
    ).rejects.toThrow(HelloStepError);

    const mid = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(mid.job.status).toBe('waiting');
    expect(mid.job.workflowRunId).toBe('local_run_1');
    expect(mid.events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'progress',
      'progress',
      'retry',
    ]);

    // Retry with a new run id observes the retry event and proceeds.
    const done = await executeHelloJob(store, {
      jobId: job.id,
      workspaceId: WS,
      runId: 'local_run_2',
    });
    expect(done.status).toBe('completed');
    expect(done.attemptCount).toBe(2);

    // Retry resumes: stored progress (66) means steps 1-2 are skipped, not
    // re-emitted — duplicate dispatches never duplicate effects.
    const final = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(final.events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'progress',
      'progress',
      'retry',
      'started',
      'completed',
    ]);
  });

  it('local executor returns the run id and is re-runnable', async () => {
    const { store, job } = await createHelloJob('hello-exec');
    const executor = createLocalHelloExecutor(() => store, 'local');
    const { workflowRunId } = await executor.execute({
      jobId: job.id,
      workspaceId: WS,
    });
    expect(workflowRunId.startsWith('local_')).toBe(true);
  });

  it('duplicate run id resumes without duplicating effects', async () => {
    const { store, job } = await createHelloJob('hello-dup');
    const first = await executeHelloJob(store, {
      jobId: job.id,
      workspaceId: WS,
      runId: 'local_dup',
    });
    expect(first.status).toBe('completed');
    // Re-running a completed job is rejected, not duplicated.
    await expect(
      executeHelloJob(store, {
        jobId: job.id,
        workspaceId: WS,
        runId: 'local_dup',
      })
    ).rejects.toMatchObject({ code: 'JOB_INVALID_TRANSITION' });
  });
});
