import type {
  JobEventRecord,
  JobEventType,
  JobPatch,
  JobRecord,
  JobStore,
  JobTxRunner,
  NewJobInput,
} from '@tokoboss/application';
import {
  JobConflictError,
  isJobEventType,
  isJobStatus,
} from '@tokoboss/application';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { jobEvents, jobs } from '../schema/index';
import type { JobEventRow, JobRow, NewJobRow } from '../schema/index';

export type DbOrTx = Transaction | DatabaseHandle;

function toJobRecord(row: JobRow): JobRecord {
  if (!isJobStatus(row.status)) {
    throw new Error(`JOB_CORRUPT: unknown status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    status: row.status,
    priority: row.priority,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
    actorType: row.actorType,
    actorId: row.actorId,
    inputRef: (row.inputRef ?? null) as Record<string, unknown> | null,
    outputRef: (row.outputRef ?? null) as Record<string, unknown> | null,
    progressCurrent: row.progressCurrent,
    progressTotal: row.progressTotal,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    nextRetryAt: row.nextRetryAt,
    workflowRunId: row.workflowRunId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toJobEventRecord(row: JobEventRow): JobEventRecord {
  if (!isJobEventType(row.type)) {
    throw new Error(`JOB_CORRUPT: unknown event type ${row.type}`);
  }
  return {
    id: row.id,
    jobId: row.jobId,
    workspaceId: row.workspaceId,
    type: row.type,
    attempt: row.attempt,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  // postgres.js surfaces `code` on the error itself; drizzle wraps driver
  // errors in `DrizzleQueryError` with the driver error on `cause`.
  // PGlite uses the same shape (verified in jobs.test.ts).
  const top = (err as { code?: unknown }).code;
  if (top === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Postgres-backed `JobStore` (Neon via `createDb`, PGlite in tests).
 * Accepts a root handle or a transaction so use cases composing extra
 * business writes stay atomic (transactional outbox).
 */
export class DrizzleJobStore implements JobStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleJobStore {
    return new DrizzleJobStore(tx);
  }

  async create(input: NewJobInput): Promise<JobRecord> {
    const row: NewJobRow = {
      workspaceId: input.workspaceId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId ?? null,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      inputRef: input.inputRef ?? null,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      scheduledAt: input.scheduledAt ?? null,
    };
    try {
      const inserted = await this.db.insert(jobs).values(row).returning();
      const created = inserted[0];
      if (!created) throw new Error('Failed to insert job');
      return toJobRecord(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new JobConflictError(input.workspaceId, input.idempotencyKey);
      }
      throw err;
    }
  }

  async findById(id: string, workspaceId: string): Promise<JobRecord | null> {
    const rows = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.workspaceId, workspaceId)))
      .limit(1);
    const row = rows[0];
    return row ? toJobRecord(row) : null;
  }

  async findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobRecord | null> {
    const rows = await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toJobRecord(row) : null;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: JobPatch
  ): Promise<JobRecord> {
    const updated = await this.db
      .update(jobs)
      .set({ ...patch })
      .where(and(eq(jobs.id, id), eq(jobs.workspaceId, workspaceId)))
      .returning();
    const row = updated[0];
    if (!row) throw new Error(`JOB_NOT_FOUND: ${id}`);
    return toJobRecord(row);
  }

  async appendEvent(
    jobId: string,
    workspaceId: string,
    type: JobEventType,
    attempt: number,
    payload?: Record<string, unknown>
  ): Promise<JobEventRecord> {
    const inserted = await this.db
      .insert(jobEvents)
      .values({ jobId, workspaceId, type, attempt, payload: payload ?? null })
      .returning();
    const event = inserted[0];
    if (!event) throw new Error('Failed to insert job event');
    return toJobEventRecord(event);
  }

  async listEvents(
    jobId: string,
    workspaceId: string
  ): Promise<JobEventRecord[]> {
    const rows = await this.db
      .select()
      .from(jobEvents)
      .where(
        and(eq(jobEvents.jobId, jobId), eq(jobEvents.workspaceId, workspaceId))
      )
      .orderBy(asc(jobEvents.createdAt), asc(jobEvents.id));
    return rows.map(toJobEventRecord);
  }

  async findStranded(input: {
    workspaceId?: string;
    retryDueBefore: Date;
    limit: number;
  }): Promise<JobRecord[]> {
    const scope =
      input.workspaceId !== undefined
        ? eq(jobs.workspaceId, input.workspaceId)
        : undefined;
    const stranded = or(
      and(eq(jobs.status, 'queued'), isNull(jobs.workflowRunId)),
      and(
        eq(jobs.status, 'waiting'),
        lte(jobs.nextRetryAt, input.retryDueBefore)
      )
    );
    const where = scope ? and(scope, stranded) : stranded;
    const rows = await this.db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(asc(jobs.createdAt))
      .limit(input.limit);
    return rows.map(toJobRecord);
  }
}

/** Create a `JobTxRunner` from a `DbHandle` (see `createDb`). */
export function drizzleJobTxRunner(handle: {
  withTransaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}): JobTxRunner {
  return {
    run: <T>(fn: (store: JobStore) => Promise<T>): Promise<T> =>
      handle.withTransaction((tx) => fn(new DrizzleJobStore(tx))),
  };
}
