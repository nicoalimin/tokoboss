import { assertJobPayloadSafe } from './job-safety';
import type {
  JobConflictError,
  JobExecutor,
  JobStore,
  JobTxRunner,
} from './job-ports';
import { JobNotFoundError, JobTransitionError } from './job-ports';
import type { JobEventRecord, JobRecord, NewJobInput } from './job-types';
import { SAFE_CANCEL_STATUSES } from './job-types';

export const HELLO_JOB_TYPE = 'hello';

const MAX_TYPE_LEN = 64;
const MAX_KEY_LEN = 128;

function requireNonEmpty(value: string | undefined, field: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`JOB_VALIDATION: ${field} must not be empty`);
  }
  return value.trim();
}

/**
 * Idempotent create (UTA-14 acceptance: duplicate start with the same
 * business idempotency key does not duplicate effects).
 *
 * The job row, its `queued` event, and any extra business writes passed via
 * `extra` commit in ONE transaction (transactional outbox): if dispatch
 * fails afterwards, the reconciler finds the stranded `queued` row and
 * dispatches it — committed work is never stranded.
 */
export async function createJob(
  tx: JobTxRunner,
  input: NewJobInput,
  extra?: (store: JobStore) => Promise<void>
): Promise<{ job: JobRecord; duplicate: boolean }> {
  const workspaceId = requireNonEmpty(input.workspaceId, 'workspaceId');
  const type = requireNonEmpty(input.type, 'type');
  if (type.length > MAX_TYPE_LEN) {
    throw new Error(`JOB_VALIDATION: type exceeds ${MAX_TYPE_LEN} chars`);
  }
  const idempotencyKey = requireNonEmpty(
    input.idempotencyKey,
    'idempotencyKey'
  );
  if (idempotencyKey.length > MAX_KEY_LEN) {
    throw new Error(
      `JOB_VALIDATION: idempotencyKey exceeds ${MAX_KEY_LEN} chars`
    );
  }
  if (input.inputRef !== undefined) {
    assertJobPayloadSafe(input.inputRef, 'input_ref');
  }

  return tx.run(async (store) => {
    const existing = await store.findByIdempotencyKey(
      workspaceId,
      idempotencyKey
    );
    if (existing) return { job: existing, duplicate: true };
    try {
      const job = await store.create({
        ...input,
        workspaceId,
        type,
        idempotencyKey,
      });
      await store.appendEvent(job.id, workspaceId, 'queued', 0, {
        type: job.type,
      });
      if (extra) await extra(store);
      return { job, duplicate: false };
    } catch (err) {
      // Concurrent duplicate create won the race: resolve to the winner
      // instead of surfacing a raw constraint violation.
      if (err instanceof Error && err.name === 'JobConflictError') {
        const winner = await store.findByIdempotencyKey(
          workspaceId,
          idempotencyKey
        );
        if (winner) return { job: winner, duplicate: true };
        throw err as JobConflictError;
      }
      throw err;
    }
  });
}

export interface ClaimStartInput {
  jobId: string;
  workspaceId: string;
  workflowRunId: string;
}

/**
 * Idempotent claim: the first claim moves `queued|waiting → running`,
 * bumps `attemptCount`, and records `started`. A duplicate claim for the
 * same `workflowRunId` returns the running row with `duplicate: true` and
 * writes nothing — duplicate starts never duplicate effects.
 */
export async function claimStartJob(
  store: JobStore,
  input: ClaimStartInput
): Promise<{ job: JobRecord; duplicate: boolean }> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled'
  ) {
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Cannot start job ${job.id} from terminal status ${job.status}`
    );
  }
  if (job.status === 'running') {
    if (job.workflowRunId === input.workflowRunId) {
      return { job, duplicate: true };
    }
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Job ${job.id} is already running under a different run`
    );
  }
  const now = new Date();
  const updated = await store.update(job.id, job.workspaceId, {
    status: 'running',
    attemptCount: job.attemptCount + 1,
    startedAt: job.startedAt ?? now,
    nextRetryAt: null,
    errorCode: null,
    errorMessage: null,
    workflowRunId: input.workflowRunId,
  });
  await store.appendEvent(
    job.id,
    job.workspaceId,
    'started',
    updated.attemptCount,
    {
      workflowRunId: input.workflowRunId,
    }
  );
  return { job: updated, duplicate: false };
}

export async function reportJobProgress(
  store: JobStore,
  input: {
    jobId: string;
    workspaceId: string;
    current: number;
    total?: number;
    note?: string;
  }
): Promise<JobRecord> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (job.status !== 'running') {
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Cannot report progress for job ${job.id} with status ${job.status}`
    );
  }
  const total = input.total ?? job.progressTotal;
  const current = Math.max(0, Math.min(input.current, total));
  if (input.note !== undefined)
    assertJobPayloadSafe({ note: input.note }, 'progress');
  const updated = await store.update(job.id, job.workspaceId, {
    progressCurrent: current,
    progressTotal: total,
  });
  await store.appendEvent(
    job.id,
    job.workspaceId,
    'progress',
    job.attemptCount,
    {
      current,
      total,
      ...(input.note ? { note: input.note } : {}),
    }
  );
  return updated;
}

export async function completeJob(
  store: JobStore,
  input: {
    jobId: string;
    workspaceId: string;
    outputRef?: Record<string, unknown>;
  }
): Promise<JobRecord> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (job.status !== 'running') {
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Cannot complete job ${job.id} with status ${job.status}`
    );
  }
  if (input.outputRef !== undefined) {
    assertJobPayloadSafe(input.outputRef, 'output_ref');
  }
  const now = new Date();
  const updated = await store.update(job.id, job.workspaceId, {
    status: 'completed',
    progressCurrent: job.progressTotal,
    completedAt: now,
    outputRef: input.outputRef ?? job.outputRef,
    errorCode: null,
    errorMessage: null,
  });
  await store.appendEvent(
    job.id,
    job.workspaceId,
    'completed',
    job.attemptCount,
    {
      attempt: job.attemptCount,
    }
  );
  return updated;
}

/** Exponential backoff with 5s base, capped at 5 minutes. */
export function computeNextRetryAt(attempt: number, from = new Date()): Date {
  const delayMs = Math.min(5000 * 2 ** Math.max(0, attempt - 1), 300_000);
  return new Date(from.getTime() + delayMs);
}

export async function failJob(
  store: JobStore,
  input: {
    jobId: string;
    workspaceId: string;
    errorCode: string;
    errorMessage?: string;
  }
): Promise<JobRecord> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (job.status !== 'running') {
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Cannot fail job ${job.id} with status ${job.status}`
    );
  }
  if (input.errorMessage !== undefined) {
    assertJobPayloadSafe({ message: input.errorMessage }, 'error');
  }
  const exhausted = job.attemptCount >= job.maxAttempts;
  if (exhausted) {
    const now = new Date();
    const updated = await store.update(job.id, job.workspaceId, {
      status: 'failed',
      completedAt: now,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage ?? null,
    });
    await store.appendEvent(
      job.id,
      job.workspaceId,
      'failed',
      job.attemptCount,
      {
        errorCode: input.errorCode,
        terminal: true,
      }
    );
    return updated;
  }
  const nextRetryAt = computeNextRetryAt(job.attemptCount);
  const updated = await store.update(job.id, job.workspaceId, {
    status: 'waiting',
    nextRetryAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage ?? null,
  });
  await store.appendEvent(job.id, job.workspaceId, 'retry', job.attemptCount, {
    errorCode: input.errorCode,
    nextRetryAt: nextRetryAt.toISOString(),
  });
  return updated;
}

/**
 * Cancel only at the documented safe checkpoint (`queued` or `waiting`).
 * `running` rejects with `JOB_NOT_CANCELLABLE`; terminal states reject with
 * `JOB_INVALID_TRANSITION`.
 */
export async function cancelJob(
  store: JobStore,
  input: { jobId: string; workspaceId: string; reason?: string }
): Promise<JobRecord> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!(SAFE_CANCEL_STATUSES as readonly string[]).includes(job.status)) {
    if (job.status === 'running') {
      throw new JobTransitionError(
        'JOB_NOT_CANCELLABLE',
        `Job ${job.id} is running (past the safe-cancel checkpoint)`
      );
    }
    throw new JobTransitionError(
      'JOB_INVALID_TRANSITION',
      `Cannot cancel job ${job.id} with status ${job.status}`
    );
  }
  if (input.reason !== undefined) {
    assertJobPayloadSafe({ reason: input.reason }, 'cancel');
  }
  const updated = await store.update(job.id, job.workspaceId, {
    status: 'cancelled',
    completedAt: new Date(),
    nextRetryAt: null,
  });
  await store.appendEvent(
    job.id,
    job.workspaceId,
    'cancelled',
    job.attemptCount,
    {
      ...(input.reason ? { reason: input.reason } : {}),
    }
  );
  return updated;
}

export interface ReconcileResult {
  examined: number;
  dispatched: string[];
  failed: Array<{ jobId: string; error: string }>;
}

/**
 * Transactional-outbox reconciler (cron-ready). Dispatches stranded work —
 * `queued` jobs that were committed but never dispatched (dispatch failed
 * after commit) and `waiting` jobs whose backoff has elapsed. Execution is
 * idempotent (workflows resume from stored progress/events), so a job the
 * executor already ran simply resolves to its current row. Per-job errors
 * are collected, never thrown, so one poisoned job cannot block the rest.
 */
export async function reconcileStrandedJobs(
  store: JobStore,
  executor: JobExecutor,
  input: { workspaceId?: string; limit?: number; now?: Date } = {}
): Promise<ReconcileResult> {
  const now = input.now ?? new Date();
  const stranded = await store.findStranded({
    workspaceId: input.workspaceId,
    retryDueBefore: now,
    limit: input.limit ?? 25,
  });
  const result: ReconcileResult = {
    examined: stranded.length,
    dispatched: [],
    failed: [],
  };
  for (const job of stranded) {
    try {
      const { workflowRunId } = await executor.execute({
        jobId: job.id,
        workspaceId: job.workspaceId,
      });
      const current = await store.findById(job.id, job.workspaceId);
      if (current && !current.workflowRunId) {
        await store.update(job.id, job.workspaceId, { workflowRunId });
      }
      result.dispatched.push(job.id);
    } catch (err) {
      result.failed.push({
        jobId: job.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
  return result;
}

export async function readJobTimeline(
  store: JobStore,
  input: { jobId: string; workspaceId: string }
): Promise<{ job: JobRecord; events: JobEventRecord[] }> {
  const job = await store.findById(input.jobId, input.workspaceId);
  if (!job) throw new JobNotFoundError(input.jobId);
  const events = await store.listEvents(input.jobId, input.workspaceId);
  return { job, events };
}
