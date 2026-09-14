/**
 * Correlation vocabulary (UTA-12).
 *
 * One vocabulary shared by web, mobile, jobs, workflows, and integrations so
 * a sample request and a sample background execution can be correlated
 * end to end with no paid vendor.
 *
 * Header names are stable and documented in `infra/observability/README.md`:
 * - `x-request-id`: per inbound request (generated if absent)
 * - `x-correlation-id`: end-to-end trace across request -> job -> integration
 * - `x-workflow-run-id`: GitHub Actions run id when present
 */

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const WORKFLOW_RUN_ID_HEADER = 'x-workflow-run-id';

/**
 * Workspace-safe context.
 *
 * `workspaceId` is an opaque, non-PII identifier (e.g. `ws_...`). Never put
 * tenant names, emails, phones, addresses, or raw marketplace payloads here —
 * the logger redacts those, but callers must not send them in the first place.
 */
export interface ObservabilityContext {
  requestId?: string;
  correlationId?: string;
  /** Opaque workspace identifier (`ws_...`). Never PII. */
  workspaceId?: string;
  jobId?: string;
  workflowRunId?: string;
  integrationCorrelationId?: string;
  deploymentId?: string;
  /** Stable machine-readable error code, e.g. `ENV_INVALID`, `DB_UNREACHABLE`. */
  errorCode?: string;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

/** Generate a `req_...` request id. */
export function newRequestId(): string {
  return newId('req');
}

/** Generate a `corr_...` end-to-end correlation id. */
export function newCorrelationId(): string {
  return newId('corr');
}

/** Generate a `job_...` background job id. */
export function newJobId(): string {
  return newId('job');
}

/**
 * Resolve the deployment id from the environment without leaking secrets.
 * Returns `null` locally (safe for health payloads).
 */
export function resolveDeploymentId(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return (
    env.VERCEL_DEPLOYMENT_ID || env.DEPLOYMENT_ID || env.GIT_COMMIT_SHA || null
  );
}

/**
 * Resolve the workflow run id (GitHub Actions) without leaking secrets.
 */
export function resolveWorkflowRunId(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return env.GITHUB_RUN_ID || null;
}

/**
 * Extract correlation context from inbound headers (Edge/Node `Headers` or a
 * plain record). Never throws; missing values stay `undefined`.
 */
export function contextFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>
): Pick<ObservabilityContext, 'requestId' | 'correlationId' | 'workflowRunId'> {
  const get = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === 'function') {
      const v = (headers as Headers).get(name);
      return v ?? undefined;
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const v = record[name] ?? record[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    requestId: get(REQUEST_ID_HEADER),
    correlationId: get(CORRELATION_ID_HEADER),
    workflowRunId: get(WORKFLOW_RUN_ID_HEADER),
  };
}

/** Headers to propagate downstream for a given context. */
export function headersFromContext(
  ctx: ObservabilityContext
): Record<string, string> {
  const out: Record<string, string> = {};
  if (ctx.requestId) out[REQUEST_ID_HEADER] = ctx.requestId;
  if (ctx.correlationId) out[CORRELATION_ID_HEADER] = ctx.correlationId;
  if (ctx.workflowRunId) out[WORKFLOW_RUN_ID_HEADER] = ctx.workflowRunId;
  return out;
}
