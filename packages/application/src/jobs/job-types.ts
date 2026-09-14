/**
 * Jobs domain model for the application layer (UTA-14).
 *
 * `jobs` is the read model: UI/API reads progress from Postgres, never from
 * a function invocation. `job_events` is append-only.
 */

export const JOB_STATUSES = [
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_EVENT_TYPES = [
  'queued',
  'started',
  'progress',
  'retry',
  'waiting',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

/**
 * Documented safe-cancel checkpoint (UTA-14): cancellation is allowed only
 * while a job is `queued` (never dispatched) or `waiting` (backoff between
 * attempts). A `running` job is past the checkpoint — its steps are
 * in-flight and cancelling could race step writes — so cancel is rejected
 * with `JOB_NOT_CANCELLABLE`. Terminal states reject with
 * `JOB_INVALID_TRANSITION`.
 */
export const SAFE_CANCEL_STATUSES: readonly JobStatus[] = [
  'queued',
  'waiting',
];

export interface JobRecord {
  id: string;
  workspaceId: string;
  type: string;
  status: JobStatus;
  priority: number;
  idempotencyKey: string;
  correlationId: string | null;
  actorType: string | null;
  actorId: string | null;
  inputRef: Record<string, unknown> | null;
  outputRef: Record<string, unknown> | null;
  progressCurrent: number;
  progressTotal: number;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  workflowRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobEventRecord {
  id: string;
  jobId: string;
  workspaceId: string;
  type: JobEventType;
  attempt: number;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface NewJobInput {
  workspaceId: string;
  type: string;
  idempotencyKey: string;
  correlationId?: string;
  actorType?: string;
  actorId?: string;
  inputRef?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: Date;
}

export type JobPatch = Partial<
  Pick<
    JobRecord,
    | 'status'
    | 'priority'
    | 'correlationId'
    | 'actorType'
    | 'actorId'
    | 'inputRef'
    | 'outputRef'
    | 'progressCurrent'
    | 'progressTotal'
    | 'attemptCount'
    | 'maxAttempts'
    | 'scheduledAt'
    | 'startedAt'
    | 'completedAt'
    | 'nextRetryAt'
    | 'workflowRunId'
    | 'errorCode'
    | 'errorMessage'
  >
>;

export function isJobStatus(value: unknown): value is JobStatus {
  return (
    typeof value === 'string' &&
    (JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function isJobEventType(value: unknown): value is JobEventType {
  return (
    typeof value === 'string' &&
    (JOB_EVENT_TYPES as readonly string[]).includes(value)
  );
}
