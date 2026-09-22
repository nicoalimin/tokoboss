import type {
  JobEventRecord,
  JobEventType,
  JobPatch,
  JobRecord,
  NewJobInput,
} from './job-types';

/**
 * Error thrown when a duplicate `(workspace_id, idempotency_key)` is
 * created concurrently and the existing row cannot be resolved by lookup.
 * Carries the conflicting key so callers can re-read instead of duplicating
 * effects.
 */
export class JobConflictError extends Error {
  readonly code = 'JOB_CONFLICT';
  constructor(
    readonly workspaceId: string,
    readonly idempotencyKey: string
  ) {
    super(
      `Job already exists for workspace ${workspaceId} with idempotency key ${idempotencyKey}`
    );
    this.name = 'JobConflictError';
  }
}

export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND';
  constructor(readonly jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class JobTransitionError extends Error {
  constructor(
    readonly code: 'JOB_NOT_CANCELLABLE' | 'JOB_INVALID_TRANSITION',
    message: string
  ) {
    super(message);
    this.name = 'JobTransitionError';
  }
}

export class JobUnsafePayloadError extends Error {
  readonly code = 'JOB_UNSAFE_PAYLOAD';
  constructor(detail: string) {
    super(`Job payload rejected: ${detail}`);
    this.name = 'JobUnsafePayloadError';
  }
}

/**
 * Persistence port for jobs + append-only events. Implementations:
 * - `DrizzleJobStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryJobStore` (here) — tests and local fallback.
 *
 * Every read is workspace-scoped so one workspace can never observe another
 * workspace's jobs.
 */
export interface JobStore {
  create(input: NewJobInput): Promise<JobRecord>;
  findById(id: string, workspaceId: string): Promise<JobRecord | null>;
  findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobRecord | null>;
  update(id: string, workspaceId: string, patch: JobPatch): Promise<JobRecord>;
  appendEvent(
    jobId: string,
    workspaceId: string,
    type: JobEventType,
    attempt: number,
    payload?: Record<string, unknown>
  ): Promise<JobEventRecord>;
  /** Ordered oldest-first; the read model for progress timelines. */
  listEvents(jobId: string, workspaceId: string): Promise<JobEventRecord[]>;
  /**
   * Stranded work for the reconciler: never-dispatched `queued` jobs plus
   * `waiting` jobs whose backoff has elapsed.
   */
  findStranded(input: {
    workspaceId?: string;
    retryDueBefore: Date;
    limit: number;
  }): Promise<JobRecord[]>;
}

/**
 * Transaction runner so a use case can commit the job row, its events, and
 * any extra business writes atomically (transactional outbox). The Drizzle
 * implementation binds the store to a real Postgres transaction; the
 * in-memory implementation just runs the callback.
 */
export interface JobTxRunner {
  run<T>(fn: (store: JobStore) => Promise<T>): Promise<T>;
}

/**
 * Executor port. The Vercel Workflow adapter implements this interface;
 * use cases and the reconciler never import workflow SDKs directly, and no
 * pg-boss or persistent worker process is introduced (UTA-14 out of scope).
 */
export interface JobExecutor {
  execute(input: { jobId: string; workspaceId: string }): Promise<{
    workflowRunId: string;
  }>;
}
