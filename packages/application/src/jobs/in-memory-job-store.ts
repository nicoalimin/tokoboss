import type { JobStore, JobTxRunner } from './job-ports';
import { JobConflictError } from './job-ports';
import type {
  JobEventRecord,
  JobEventType,
  JobPatch,
  JobRecord,
  NewJobInput,
} from './job-types';

/**
 * Structured clone that preserves `Date` instances (unlike
 * `JSON.parse(JSON.stringify(...))`, which silently turns them into strings
 * and breaks `nextRetryAt` comparisons in `findStranded`).
 */
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

function now(): Date {
  return new Date();
}

/**
 * In-memory `JobStore` + `JobTxRunner` for unit tests and the web local
 * fallback (no `DATABASE_URL`). Enforces the same contracts as Postgres:
 * workspace scoping, `(workspace_id, idempotency_key)` uniqueness, ordered
 * events, stranded query semantics.
 */
export class InMemoryJobStore implements JobStore, JobTxRunner {
  private jobs = new Map<string, JobRecord>();
  private byKey = new Map<string, string>();
  private events: JobEventRecord[] = [];
  private seq = 0;

  async run<T>(fn: (store: JobStore) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, '0')}`;
  }

  async create(input: NewJobInput): Promise<JobRecord> {
    const key = `${input.workspaceId}::${input.idempotencyKey}`;
    if (this.byKey.has(key)) {
      throw new JobConflictError(input.workspaceId, input.idempotencyKey);
    }
    const timestamp = now();
    const job: JobRecord = {
      id: this.nextId('job'),
      workspaceId: input.workspaceId,
      type: input.type,
      status: 'queued',
      priority: input.priority ?? 0,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId ?? null,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      inputRef: input.inputRef ? clone(input.inputRef) : null,
      outputRef: null,
      progressCurrent: 0,
      progressTotal: 100,
      attemptCount: 0,
      maxAttempts: 3,
      scheduledAt: input.scheduledAt ?? null,
      startedAt: null,
      completedAt: null,
      nextRetryAt: null,
      workflowRunId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.maxAttempts !== undefined) job.maxAttempts = input.maxAttempts;
    this.jobs.set(job.id, job);
    this.byKey.set(key, job.id);
    return clone(job);
  }

  async findById(id: string, workspaceId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(id);
    if (!job || job.workspaceId !== workspaceId) return null;
    return clone(job);
  }

  async findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobRecord | null> {
    const id = this.byKey.get(`${workspaceId}::${idempotencyKey}`);
    if (!id) return null;
    return this.findById(id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: JobPatch
  ): Promise<JobRecord> {
    const job = this.jobs.get(id);
    if (!job || job.workspaceId !== workspaceId) {
      throw new Error(`JOB_NOT_FOUND: ${id}`);
    }
    const updated: JobRecord = {
      ...job,
      ...clone(patch),
      id: job.id,
      workspaceId: job.workspaceId,
      updatedAt: now(),
    };
    this.jobs.set(id, updated);
    return clone(updated);
  }

  async appendEvent(
    jobId: string,
    workspaceId: string,
    type: JobEventType,
    attempt: number,
    payload?: Record<string, unknown>
  ): Promise<JobEventRecord> {
    const job = this.jobs.get(jobId);
    if (!job || job.workspaceId !== workspaceId) {
      throw new Error(`JOB_NOT_FOUND: ${jobId}`);
    }
    const event: JobEventRecord = {
      id: this.nextId('evt'),
      jobId,
      workspaceId,
      type,
      attempt,
      payload: payload ? clone(payload) : null,
      createdAt: now(),
    };
    this.events.push(event);
    return clone(event);
  }

  async listEvents(
    jobId: string,
    workspaceId: string
  ): Promise<JobEventRecord[]> {
    return clone(
      this.events.filter(
        (e) => e.jobId === jobId && e.workspaceId === workspaceId
      )
    );
  }

  async findStranded(input: {
    workspaceId?: string;
    retryDueBefore: Date;
    limit: number;
  }): Promise<JobRecord[]> {
    const out: JobRecord[] = [];
    for (const job of this.jobs.values()) {
      if (input.workspaceId && job.workspaceId !== input.workspaceId) continue;
      if (job.status === 'queued' && !job.workflowRunId) {
        out.push(clone(job));
      } else if (
        job.status === 'waiting' &&
        job.nextRetryAt &&
        job.nextRetryAt <= input.retryDueBefore
      ) {
        out.push(clone(job));
      }
      if (out.length >= input.limit) break;
    }
    return out;
  }
}
