import { describe, expect, it } from 'vitest';
import {
  contextFromHeaders,
  headersFromContext,
  newCorrelationId,
  newJobId,
  newRequestId,
  resolveDeploymentId,
  resolveWorkflowRunId,
} from '../correlation.js';

describe('correlation', () => {
  it('generates prefixed unique ids', () => {
    expect(newRequestId().startsWith('req_')).toBe(true);
    expect(newCorrelationId().startsWith('corr_')).toBe(true);
    expect(newJobId().startsWith('job_')).toBe(true);
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it('round-trips headers', () => {
    const ctx = {
      requestId: 'req_a',
      correlationId: 'corr_b',
      workflowRunId: '123',
    };
    const headers = headersFromContext(ctx);
    expect(headers['x-request-id']).toBe('req_a');
    expect(headers['x-correlation-id']).toBe('corr_b');
    const back = contextFromHeaders(headers);
    expect(back.requestId).toBe('req_a');
    expect(back.correlationId).toBe('corr_b');
  });

  it('resolves deployment/workflow ids without secrets', () => {
    expect(
      resolveDeploymentId({
        VERCEL_DEPLOYMENT_ID: 'dpl_1',
      } as NodeJS.ProcessEnv)
    ).toBe('dpl_1');
    expect(resolveDeploymentId({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      resolveWorkflowRunId({ GITHUB_RUN_ID: '999' } as NodeJS.ProcessEnv)
    ).toBe('999');
  });
});
