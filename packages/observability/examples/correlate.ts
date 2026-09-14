// UTA-12 evidence: one correlation id across a sample web request and a
// sample background execution. Run with:
//   pnpm --filter @tokoboss/observability example:correlate
import { getDeploymentMetadata } from '@tokoboss/config';
import {
  deriveJobContext,
  newCorrelationContext,
  toCorrelationHeaders,
  workflowRunIdFromEnv,
} from '../src/correlation';
import { createLogger } from '../src/logger';

async function main(): Promise<void> {
  const logger = createLogger('uta-12-evidence');
  const meta = getDeploymentMetadata();

  // 1. Sample inbound request (web/mobile -> API).
  const requestCtx = newCorrelationContext({
    workspaceId: 'ws_evidence',
    workflowRunId: workflowRunIdFromEnv(),
    deploymentId: meta.deploymentId ?? meta.commitSha?.slice(0, 12) ?? 'local',
  });
  const requestLog = logger.withContext(requestCtx);
  requestLog.info({
    ...requestCtx,
    event: 'request.start',
    message: 'POST /api/v1/sync (sample)',
    headers: toCorrelationHeaders(requestCtx),
  });

  // 2. Sample background execution derived from the same request.
  const jobCtx = deriveJobContext(requestCtx, 'job_evidence_sync_1');
  await logger.runJob(requestCtx, jobCtx.jobId as string, async () => {
    logger.withContext(jobCtx).info({
      ...jobCtx,
      event: 'integration.sync',
      message: 'marketplace sync (sample, payload redacted)',
      integrationCorrelationId: 'int_evidence_1',
      marketplace_payload: { order: 1 },
      DATABASE_URL: 'postgres://user:pass@host/db',
    });
  });

  requestLog.info({
    ...requestCtx,
    event: 'request.done',
    message: 'POST /api/v1/sync completed (sample)',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
