/**
 * Sample background execution (UTA-12 completion evidence).
 *
 * `runSampleJob` reuses the inbound request's `correlationId` so a sample
 * request and a sample background execution correlate end to end:
 *
 *   request (corr_abc, req_xyz) -> job (job_..., corr_abc)
 *
 * Emits redacted JSON lines via the shared logger and returns the evidence
 * object the docs paste into `infra/observability/correlation-evidence.md`.
 */

import { newJobId, type ObservabilityContext } from './correlation';
import { createLogger } from './logger';

export interface SampleJobInput {
  correlationId: string;
  requestId?: string;
  workspaceId?: string;
  workflowRunId?: string;
  integrationCorrelationId?: string;
  task?: string;
  service?: string;
  sink?: (line: string) => void;
}

export interface SampleJobResult {
  jobId: string;
  correlationId: string;
  requestId?: string;
  status: 'completed';
}

export async function runSampleJob(
  input: SampleJobInput
): Promise<SampleJobResult> {
  const jobId = newJobId();
  const sink = input.sink ?? ((line: string) => console.log(line));
  const ctx: ObservabilityContext = {
    jobId,
    correlationId: input.correlationId,
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    workflowRunId: input.workflowRunId,
    integrationCorrelationId: input.integrationCorrelationId,
  };
  const log = createLogger({
    service: input.service ?? 'sample-job',
    baseContext: ctx,
    sink,
  });

  log.info('sample job started', {
    task: input.task ?? 'reconcile-sample',
  });
  // Simulate async work without I/O so tests stay hermetic.
  await new Promise((resolve) => setTimeout(resolve, 1));
  log.info('sample job finished', { status: 'completed' });

  return {
    jobId,
    correlationId: input.correlationId,
    requestId: input.requestId,
    status: 'completed',
  };
}
