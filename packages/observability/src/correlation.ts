// Correlation vocabulary (UTA-12).
//
// One vocabulary shared by web, mobile clients (via headers), background
// jobs, GitHub workflows, and marketplace integrations — so a sample request
// and a sample background execution can be correlated end to end without any
// paid monitoring vendor.
//
// Field names are stable and documented in infra/observability/README.md.

export interface CorrelationContext {
  /** Unique per inbound request / execution. Propagates to jobs + integrations. */
  requestId: string;
  /** Workspace-safe scope. A workspace/tenant ID is allowed; never raw PII. */
  workspaceId?: string;
  /** Background job identifier (queue job, cron run, workflow step). */
  jobId?: string;
  /** GitHub Actions run identifier (`owner/repo#run/attempt`). */
  workflowRunId?: string;
  /** Marketplace / integration correlation token (our value, not vendor payload). */
  integrationCorrelationId?: string;
  /** Deployment identifier (Vercel deployment id / commit sha / local). */
  deploymentId?: string;
  /** Safe machine-readable error code (e.g. `validation_failed`, never a secret). */
  errorCode?: string;
}

export const CORRELATION_HEADER_REQUEST_ID = 'x-tokoboss-request-id';
export const CORRELATION_HEADER_WORKSPACE_ID = 'x-tokoboss-workspace-id';
export const CORRELATION_HEADER_JOB_ID = 'x-tokoboss-job-id';
export const CORRELATION_HEADER_WORKFLOW_RUN_ID = 'x-tokoboss-workflow-run-id';
export const CORRELATION_HEADER_INTEGRATION_ID =
  'x-tokoboss-integration-correlation-id';

function randomId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  return `${prefix}_${rand}`;
}

/** Create a fresh root correlation context for an inbound request/execution. */
export function newCorrelationContext(
  partial: Partial<CorrelationContext> = {}
): CorrelationContext {
  const defined: Partial<CorrelationContext> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) (defined as Record<string, unknown>)[k] = v;
  }
  return {
    requestId: defined.requestId ?? randomId('req'),
    ...defined,
  };
}

/** Derive a child (job) context from a request context — requestId is preserved. */
export function deriveJobContext(
  parent: CorrelationContext,
  jobId: string
): CorrelationContext {
  return { ...parent, jobId };
}

/** Serialize the context to outbound HTTP headers (mobile/web → API → jobs). */
export function toCorrelationHeaders(
  ctx: CorrelationContext
): Record<string, string> {
  const headers: Record<string, string> = {
    [CORRELATION_HEADER_REQUEST_ID]: ctx.requestId,
  };
  if (ctx.workspaceId)
    headers[CORRELATION_HEADER_WORKSPACE_ID] = ctx.workspaceId;
  if (ctx.jobId) headers[CORRELATION_HEADER_JOB_ID] = ctx.jobId;
  if (ctx.workflowRunId)
    headers[CORRELATION_HEADER_WORKFLOW_RUN_ID] = ctx.workflowRunId;
  if (ctx.integrationCorrelationId)
    headers[CORRELATION_HEADER_INTEGRATION_ID] = ctx.integrationCorrelationId;
  return headers;
}

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Parse inbound headers back into a context. Never throws — returns fresh root. */
export function fromCorrelationHeaders(
  headers: Record<string, string | string[] | undefined>
): CorrelationContext {
  const ctx = newCorrelationContext({
    requestId: firstHeader(headers, CORRELATION_HEADER_REQUEST_ID),
  });
  const workspaceId = firstHeader(headers, CORRELATION_HEADER_WORKSPACE_ID);
  const jobId = firstHeader(headers, CORRELATION_HEADER_JOB_ID);
  const workflowRunId = firstHeader(
    headers,
    CORRELATION_HEADER_WORKFLOW_RUN_ID
  );
  const integrationCorrelationId = firstHeader(
    headers,
    CORRELATION_HEADER_INTEGRATION_ID
  );
  if (workspaceId) ctx.workspaceId = workspaceId;
  if (jobId) ctx.jobId = jobId;
  if (workflowRunId) ctx.workflowRunId = workflowRunId;
  if (integrationCorrelationId)
    ctx.integrationCorrelationId = integrationCorrelationId;
  return ctx;
}

/** Read the GitHub workflow run id from the environment (CI correlation). */
export function workflowRunIdFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const repo = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;
  if (!repo || !runId) return undefined;
  const attempt = env.GITHUB_RUN_ATTEMPT ?? '1';
  return `${repo}#${runId}/${attempt}`;
}
