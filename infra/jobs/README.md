# Jobs hello-path (UTA-14)

Application-owned async observability: `jobs` + append-only `job_events` in
Neon/Postgres (migration `infra/drizzle/0003_jobs_job_events.sql`), use-case
ports in `@tokoboss/application`, one idempotent hello Workflow in
`web/src/workflows/`, and a transactional-outbox reconciler. No pg-boss.

## Run the hello Workflow locally

Without `DATABASE_URL` the routes use a process-local in-memory store
(`storage: "memory"` in responses — never mistake it for Postgres evidence):

```bash
pnpm --filter @tokoboss/web dev

# Start (idempotency key optional; defaults to hello-<correlationId>)
curl -X POST localhost:3000/api/jobs/hello \
  -H 'x-workspace-id: ws_local' \
  -H 'content-type: application/json' \
  -d '{"idempotencyKey":"demo-1"}'

# Read progress + ordered events
curl localhost:3000/api/jobs/<jobId> -H 'x-workspace-id: ws_local'

# Duplicate start: same key returns the same job, no duplicated effects
curl -X POST localhost:3000/api/jobs/hello \
  -H 'x-workspace-id: ws_local' \
  -H 'content-type: application/json' \
  -d '{"idempotencyKey":"demo-1"}'
```

## Forced step failure → retry

```bash
curl -X POST localhost:3000/api/jobs/hello \
  -H 'x-workspace-id: ws_local' \
  -H 'content-type: application/json' \
  -d '{"idempotencyKey":"demo-retry","failStepOnce":true}'
# → 202, status `waiting`, timeline ends with a `retry` event.

# After the backoff (or immediately in tests), reconcile re-runs the
# workflow; it observes the `retry` event, skips the failure, and completes:
curl -X POST localhost:3000/api/jobs/reconcile \
  -H 'x-workspace-id: ws_local'
```

## Preview / Neon

Point `DATABASE_URL` at a non-production Neon branch (UTA-11 wiring provides
it on preview), run `pnpm --filter @tokoboss/database db:migrate`, then use
the same routes — responses report `storage: "postgres"`, and the completion
evidence is the job row + event timeline read back from Postgres plus the
`workflow_run_id` (`local_<uuid>` until the Vercel Workflow adapter lands).

## Reconciliation

Entrypoint: `POST /api/jobs/reconcile`
(`reconcileStrandedJobs` in `packages/application/src/jobs/`).
Stranded = committed-but-never-dispatched `queued` jobs
(`workflow_run_id IS NULL`) plus `waiting` jobs whose backoff elapsed.
Execution is idempotent (workflows resume from stored progress/events), so
this is safe on a schedule. With `CRON_SECRET` set, callers must send a
matching `x-cron-secret` header; without it (local), scope with
`x-workspace-id`. Production cron wiring is out of scope for UTA-14.

## Safe-cancel checkpoint

Cancellation is allowed only while a job is `queued` or `waiting`
(`SAFE_CANCEL_STATUSES`). A `running` job is past the checkpoint — steps are
in-flight — so cancel is rejected with `JOB_NOT_CANCELLABLE`; terminal states
reject with `JOB_INVALID_TRANSITION`. Use case: `cancelJob`.
