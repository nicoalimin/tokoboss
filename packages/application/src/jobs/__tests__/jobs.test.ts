import { describe, expect, it } from 'vitest';
import {
  InMemoryJobStore,
  assertJobPayloadSafe,
  cancelJob,
  claimStartJob,
  completeJob,
  createJob,
  failJob,
  JobNotFoundError,
  JobTransitionError,
  JobUnsafePayloadError,
  readJobTimeline,
  reconcileStrandedJobs,
  reportJobProgress,
  type JobExecutor,
} from '../index';

const WS = 'ws_test';

async function newStore() {
  return new InMemoryJobStore();
}

async function createHello(store: InMemoryJobStore, key = 'biz-1') {
  return createJob(store, {
    workspaceId: WS,
    type: 'hello',
    idempotencyKey: key,
    correlationId: 'corr_1',
    inputRef: { greeting: 'hello' },
  });
}

describe('idempotent create', () => {
  it('duplicate idempotency key does not duplicate effects', async () => {
    const store = await newStore();
    const first = await createHello(store);
    expect(first.duplicate).toBe(false);
    const second = await createHello(store);
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);

    const { events } = await readJobTimeline(store, {
      jobId: first.job.id,
      workspaceId: WS,
    });
    // Exactly one queued event — no duplicated side effects.
    expect(events.filter((e) => e.type === 'queued')).toHaveLength(1);
    expect(events).toHaveLength(1);
  });
});

describe('idempotent claim/start', () => {
  it('duplicate start with the same run id writes nothing new', async () => {
    const store = await newStore();
    const { job } = await createHello(store);
    const first = await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    expect(first.duplicate).toBe(false);
    expect(first.job.attemptCount).toBe(1);

    const second = await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    expect(second.duplicate).toBe(true);
    expect(second.job.attemptCount).toBe(1);

    const { events } = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(events.filter((e) => e.type === 'started')).toHaveLength(1);
  });

  it('claim under a different run id is rejected', async () => {
    const store = await newStore();
    const { job } = await createHello(store);
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await expect(
      claimStartJob(store, {
        jobId: job.id,
        workspaceId: WS,
        workflowRunId: 'run_2',
      })
    ).rejects.toMatchObject({ code: 'JOB_INVALID_TRANSITION' });
  });
});

describe('forced failure retry timeline', () => {
  it('retry ends in a traceable completed state with ordered events', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-retry');

    // Attempt 1: start, progress, forced failure -> waiting + retry event.
    const claimed = await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    expect(claimed.job.status).toBe('running');
    await reportJobProgress(store, {
      jobId: job.id,
      workspaceId: WS,
      current: 50,
    });
    const waiting = await failJob(store, {
      jobId: job.id,
      workspaceId: WS,
      errorCode: 'STEP_FAILED',
      errorMessage: 'forced step failure',
    });
    expect(waiting.status).toBe('waiting');
    expect(waiting.nextRetryAt).not.toBeNull();

    // Attempt 2 (after backoff): start, progress, complete.
    const retry = await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1_retry',
    });
    expect(retry.job.attemptCount).toBe(2);
    await reportJobProgress(store, {
      jobId: job.id,
      workspaceId: WS,
      current: 100,
    });
    const done = await completeJob(store, {
      jobId: job.id,
      workspaceId: WS,
      outputRef: { greeting: 'hello', steps: 3 },
    });
    expect(done.status).toBe('completed');
    expect(done.workflowRunId).toBe('run_1_retry');

    const { events } = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'progress',
      'retry',
      'started',
      'progress',
      'completed',
    ]);
    // Attempts recorded per event.
    expect(events.map((e) => e.attempt)).toEqual([0, 1, 1, 1, 2, 2, 2]);
  });

  it('terminal failure after max attempts', async () => {
    const store = await newStore();
    const { job } = await createJob(store, {
      workspaceId: WS,
      type: 'hello',
      idempotencyKey: 'biz-max',
      maxAttempts: 1,
    });
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    const failed = await failJob(store, {
      jobId: job.id,
      workspaceId: WS,
      errorCode: 'STEP_FAILED',
    });
    expect(failed.status).toBe('failed');
  });
});

describe('safe-cancel checkpoint', () => {
  it('allows cancel while queued or waiting', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-cancel-1');
    const cancelled = await cancelJob(store, {
      jobId: job.id,
      workspaceId: WS,
      reason: 'no longer needed',
    });
    expect(cancelled.status).toBe('cancelled');

    const { job: job2 } = await createHello(store, 'biz-cancel-2');
    await claimStartJob(store, {
      jobId: job2.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await failJob(store, {
      jobId: job2.id,
      workspaceId: WS,
      errorCode: 'STEP_FAILED',
    });
    const cancelled2 = await cancelJob(store, {
      jobId: job2.id,
      workspaceId: WS,
    });
    expect(cancelled2.status).toBe('cancelled');
  });

  it('rejects cancel while running (past the checkpoint)', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-cancel-3');
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await expect(
      cancelJob(store, { jobId: job.id, workspaceId: WS })
    ).rejects.toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
  });

  it('rejects cancel from terminal states', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-cancel-4');
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await completeJob(store, { jobId: job.id, workspaceId: WS });
    await expect(
      cancelJob(store, { jobId: job.id, workspaceId: WS })
    ).rejects.toMatchObject({ code: 'JOB_INVALID_TRANSITION' });
  });
});

describe('payload safety', () => {
  it('rejects secrets and raw PII in refs', () => {
    expect(() =>
      assertJobPayloadSafe({ email: 'buyer@example.com' }, 'input_ref')
    ).toThrow(JobUnsafePayloadError);
    expect(() =>
      assertJobPayloadSafe({ token: 'sk-abcdef1234567890' }, 'input_ref')
    ).toThrow(JobUnsafePayloadError);
    expect(() =>
      assertJobPayloadSafe({ url: 'postgres://user:pass@host/db' }, 'input_ref')
    ).toThrow(JobUnsafePayloadError);
    expect(() =>
      assertJobPayloadSafe({ phone: '+6281234567890' }, 'input_ref')
    ).toThrow(JobUnsafePayloadError);
    expect(() =>
      assertJobPayloadSafe({ note: 'see 3174051201900001 attached' }, 'x')
    ).toThrow(JobUnsafePayloadError);
    expect(() =>
      assertJobPayloadSafe({ raw_payload: { anything: 1 } }, 'input_ref')
    ).toThrow(JobUnsafePayloadError);
  });

  it('accepts reference-style metadata', () => {
    expect(() =>
      assertJobPayloadSafe(
        { greeting: 'hello', step: 2, ref: 'order_123' },
        'input_ref'
      )
    ).not.toThrow();
  });

  it('create/complete enforce safety at the boundary', async () => {
    const store = await newStore();
    await expect(
      createJob(store, {
        workspaceId: WS,
        type: 'hello',
        idempotencyKey: 'biz-evil',
        inputRef: { email: 'buyer@example.com' },
      })
    ).rejects.toThrow(JobUnsafePayloadError);

    const { job } = await createHello(store, 'biz-ok');
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await expect(
      completeJob(store, {
        jobId: job.id,
        workspaceId: WS,
        outputRef: { token: 'sk-abcdef1234567890' },
      })
    ).rejects.toThrow(JobUnsafePayloadError);
  });
});

describe('transactional outbox reconciler', () => {
  const executor: JobExecutor = {
    execute: async () => ({ workflowRunId: 'run_reconciled' }),
  };

  it('dispatches stranded queued jobs and backfills the run id', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-stranded');
    // Committed but never dispatched: queued + no workflow run id.
    const before = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(before.job.workflowRunId).toBeNull();

    const result = await reconcileStrandedJobs(store, executor, {
      workspaceId: WS,
    });
    expect(result).toMatchObject({ examined: 1, dispatched: [job.id] });

    const after = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId: WS,
    });
    expect(after.job.workflowRunId).toBe('run_reconciled');
  });

  it('dispatches due waiting jobs, not only undispatched ones', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-waiting');
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    await failJob(store, {
      jobId: job.id,
      workspaceId: WS,
      errorCode: 'STEP_FAILED',
    });
    // Backoff is ~5s; reconciling in the far future must find the job.
    // (Regression: Dates must survive the store round-trip for this query.)
    const future = new Date(Date.now() + 60_000);
    const seen: string[] = [];
    const result = await reconcileStrandedJobs(
      store,
      {
        execute: async ({ jobId }) => {
          seen.push(jobId);
          return { workflowRunId: 'run_retry' };
        },
      },
      { workspaceId: WS, now: future }
    );
    expect(result.examined).toBe(1);
    expect(seen).toEqual([job.id]);
  });

  it('collects per-job errors without blocking the rest', async () => {
    const store = await newStore();
    const a = await createHello(store, 'biz-a');
    const b = await createHello(store, 'biz-b');
    const flaky: JobExecutor = {
      execute: async ({ jobId }) => {
        if (jobId === a.job.id) throw new Error('dispatch boom');
        return { workflowRunId: 'run_b' };
      },
    };
    const result = await reconcileStrandedJobs(store, flaky, {
      workspaceId: WS,
    });
    expect(result.examined).toBe(2);
    expect(result.dispatched).toEqual([b.job.id]);
    expect(result.failed).toHaveLength(1);
  });

  it('throws JobNotFoundError for unknown jobs', async () => {
    const store = await newStore();
    await expect(
      readJobTimeline(store, { jobId: 'job_missing', workspaceId: WS })
    ).rejects.toThrow(JobNotFoundError);
    await expect(
      claimStartJob(store, {
        jobId: 'job_missing',
        workspaceId: WS,
        workflowRunId: 'run_x',
      })
    ).rejects.toThrow(JobNotFoundError);
  });
});

describe('cross-workspace isolation', () => {
  it('one workspace cannot read another workspace job', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-iso');
    await expect(
      readJobTimeline(store, { jobId: job.id, workspaceId: 'ws_other' })
    ).rejects.toThrow(JobNotFoundError);
  });
});

describe('transition errors carry codes', () => {
  it('exposes JOB_NOT_CANCELLABLE distinctly', async () => {
    const store = await newStore();
    const { job } = await createHello(store, 'biz-code');
    await claimStartJob(store, {
      jobId: job.id,
      workspaceId: WS,
      workflowRunId: 'run_1',
    });
    const err = await cancelJob(store, {
      jobId: job.id,
      workspaceId: WS,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobTransitionError);
    expect((err as JobTransitionError).code).toBe('JOB_NOT_CANCELLABLE');
  });
});
