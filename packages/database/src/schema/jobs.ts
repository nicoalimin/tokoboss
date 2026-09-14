import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, utcTimestamps, uuidPk } from './helpers';

/**
 * Jobs — application-owned async observability (UTA-14).
 *
 * Tenancy: `workspace_id` references `tenants.id`. In UTA-14 a workspace IS
 * the tenant isolation boundary (one workspace per tenant); a separate
 * `workspaces` table is out of scope.
 *
 * Idempotency: `(workspace_id, idempotency_key)` is unique, so a duplicate
 * start with the same business key resolves to the existing row instead of
 * duplicating effects.
 *
 * Status lifecycle: `queued → running → completed`, with `waiting`
 * (scheduled/retry backoff), `failed` (terminal or pre-retry), and
 * `cancelled` (terminal, only via the documented safe checkpoint).
 * The `jobs` row is the read model — UI/API reads progress from Postgres,
 * never from a function invocation.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Job flavour, e.g. `hello`. Real marketplace/import/label types later. */
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    /** Business idempotency key (caller-supplied, opaque, no PII). */
    idempotencyKey: text('idempotency_key').notNull(),
    /** End-to-end trace id (observability correlation vocabulary). */
    correlationId: text('correlation_id'),
    /** Who requested the job (opaque ids only, never email/name). */
    actorType: text('actor_type'),
    actorId: text('actor_id'),
    /** References to inputs/outputs (ids/URIs), never raw payloads or PII. */
    inputRef: jsonb('input_ref').$type<Record<string, unknown>>(),
    outputRef: jsonb('output_ref').$type<Record<string, unknown>>(),
    progressCurrent: integer('progress_current').notNull().default(0),
    progressTotal: integer('progress_total').notNull().default(100),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    nextRetryAt: timestamp('next_retry_at', {
      withTimezone: true,
      mode: 'date',
    }),
    /** Vercel Workflow run id once dispatched; null while undispatched. */
    workflowRunId: text('workflow_run_id'),
    /** Safe error taxonomy + redacted message (assertNoSecrets enforced). */
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('jobs_workspace_idempotency_unique').on(
      t.workspaceId,
      t.idempotencyKey
    ),
    index('jobs_workspace_status_idx').on(t.workspaceId, t.status),
    index('jobs_workflow_run_idx').on(t.workflowRunId),
  ]
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;

/**
 * Job events — append-only log owned by a job (UTA-14).
 *
 * Event types: `queued | started | progress | retry | waiting | completed |
 * failed | cancelled`. Payloads carry progress/metadata only — no secrets or
 * raw PII (enforced by `assertNoSecrets` at the use-case boundary and covered
 * by safety tests). `workspace_id` is denormalised for tenant-scoped ordered
 * reads without joining `jobs`.
 */
export const jobEvents = pgTable(
  'job_events',
  {
    id: uuidPk(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** 1-based attempt number this event belongs to (0 = pre-dispatch). */
    attempt: integer('attempt').notNull().default(0),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('job_events_job_created_idx').on(t.jobId, t.createdAt),
    index('job_events_workspace_created_idx').on(t.workspaceId, t.createdAt),
  ]
);

export type JobEventRow = typeof jobEvents.$inferSelect;
export type NewJobEventRow = typeof jobEvents.$inferInsert;
