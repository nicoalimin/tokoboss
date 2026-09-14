import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  createLogger,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
} from '@tokoboss/observability';
import {
  JobNotFoundError,
  JobTransitionError,
  JobUnsafePayloadError,
  createJob,
  readJobTimeline,
} from '@tokoboss/application';
import { getJobExecutor, getJobStore, getJobTxRunner, storageKind } from '@/lib/jobs';
import { HelloStepError } from '@/workflows/hello';

const WORKSPACE_HEADER = 'x-workspace-id';

/**
 * Start the hello Workflow (UTA-14 hello-path).
 * POST /api/jobs/hello
 *
 * Auth (stub, documented): tenancy comes from the required
 * `x-workspace-id` header; an optional `Authorization: Bearer …` token is
 * recorded only as an opaque actor reference (presence is logged, the token
 * value never is). Real session auth is out of scope for UTA-14.
 *
 * Body: `{ idempotencyKey, inputRef?, failStepOnce? }`. The create is
 * idempotent by `(workspace_id, idempotency_key)`; a duplicate key resumes
 * or re-reads the existing job instead of duplicating effects.
 */
export async function POST(request: Request) {
  const inbound = contextFromHeaders(
    Object.fromEntries(new Headers(request.headers).entries())
  );
  const requestId = inbound.requestId ?? newRequestId();
  const correlationId = inbound.correlationId ?? newCorrelationId();
  const deploymentId = resolveDeploymentId() ?? undefined;
  const log = createLogger({
    service: 'web',
    baseContext: { requestId, correlationId, deploymentId },
  });

  const workspaceId = request.headers.get(WORKSPACE_HEADER)?.trim();
  if (!workspaceId) {
    return json(
      { error: 'missing x-workspace-id', errorCode: 'JOB_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  const authHeader = request.headers.get('authorization');
  const actor =
    authHeader?.startsWith('Bearer ') && authHeader.length > 7
      ? { actorType: 'bearer-stub', actorId: 'bearer-present' }
      : { actorType: 'anonymous', actorId: 'anonymous' };

  let body: {
    idempotencyKey?: unknown;
    inputRef?: unknown;
    failStepOnce?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (
    body.idempotencyKey !== undefined &&
    typeof body.idempotencyKey !== 'string'
  ) {
    return json(
      { error: 'idempotencyKey must be a string', errorCode: 'JOB_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  if (body.inputRef !== undefined &&
    (typeof body.inputRef !== 'object' ||
      body.inputRef === null ||
      Array.isArray(body.inputRef))) {
    return json(
      { error: 'inputRef must be an object', errorCode: 'JOB_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  const inputRef: Record<string, unknown> = {
    ...((body.inputRef as Record<string, unknown> | undefined) ?? {}),
  };
  if (body.failStepOnce === true) inputRef['failStepOnce'] = true;

  const store = getJobStore();
  const idempotencyKey =
    body.idempotencyKey && body.idempotencyKey.length > 0
      ? body.idempotencyKey
      : `hello-${correlationId}`;

  try {
    const { job, duplicate } = await createJob(getJobTxRunner(), {
      workspaceId,
      type: 'hello',
      idempotencyKey,
      correlationId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      inputRef,
    });
    log.info('hello job requested', {
      jobId: job.id,
      route: '/api/jobs/hello',
      duplicate,
    });

    if (duplicate && job.status !== 'queued' && job.status !== 'waiting') {
      const timeline = await readJobTimeline(store, {
        jobId: job.id,
        workspaceId,
      });
      return json(
        { job: timeline.job, events: timeline.events, storage: storageKind() },
        200,
        requestId,
        correlationId
      );
    }

    try {
      await getJobExecutor().execute({ jobId: job.id, workspaceId });
    } catch (err) {
      if (err instanceof HelloStepError) {
        // Forced step failure: the job row is `waiting` with a `retry`
        // event and a scheduled backoff — the traceable pre-retry state.
        const timeline = await readJobTimeline(store, {
          jobId: job.id,
          workspaceId,
        });
        log.info('hello job awaiting retry', { jobId: job.id });
        return json(
          {
            job: timeline.job,
            events: timeline.events,
            storage: storageKind(),
            retryable: true,
          },
          202,
          requestId,
          correlationId
        );
      }
      throw err;
    }

    const timeline = await readJobTimeline(store, {
      jobId: job.id,
      workspaceId,
    });
    return json(
      { job: timeline.job, events: timeline.events, storage: storageKind() },
      duplicate ? 200 : 201,
      requestId,
      correlationId
    );
  } catch (err) {
    if (err instanceof JobUnsafePayloadError) {
      return json(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    if (err instanceof JobTransitionError || err instanceof JobNotFoundError) {
      return json(
        {
          error: err.message,
          errorCode: err instanceof JobTransitionError ? err.code : 'JOB_NOT_FOUND',
        },
        409,
        requestId,
        correlationId
      );
    }
    if (err instanceof Error && err.message.startsWith('JOB_VALIDATION')) {
      return json(
        { error: err.message, errorCode: 'JOB_VALIDATION' },
        400,
        requestId,
        correlationId
      );
    }
    log.warn('hello job failed', {
      route: '/api/jobs/hello',
      errorCode: 'JOB_DISPATCH_FAILED',
    });
    return json(
      { error: 'dispatch failed', errorCode: 'JOB_DISPATCH_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}

function json(
  body: unknown,
  status: number,
  requestId: string,
  correlationId: string
) {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}
