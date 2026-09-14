import { describe, expect, it } from 'vitest';
import {
  deriveJobContext,
  fromCorrelationHeaders,
  newCorrelationContext,
  toCorrelationHeaders,
  workflowRunIdFromEnv,
} from '../correlation';

describe('correlation vocabulary', () => {
  it('creates unique request ids by default', () => {
    const a = newCorrelationContext();
    const b = newCorrelationContext();
    expect(a.requestId).toMatch(/^req_/);
    expect(b.requestId).not.toBe(a.requestId);
  });

  it('derives a job context preserving the request id', () => {
    const parent = newCorrelationContext({ workspaceId: 'ws_123' });
    const job = deriveJobContext(parent, 'job_456');
    expect(job.requestId).toBe(parent.requestId);
    expect(job.jobId).toBe('job_456');
    expect(job.workspaceId).toBe('ws_123');
  });

  it('round-trips through headers (web/mobile -> api -> job)', () => {
    const ctx = newCorrelationContext({
      workspaceId: 'ws_123',
      jobId: 'job_456',
      workflowRunId: 'acme/repo#42/1',
      integrationCorrelationId: 'int_789',
    });
    const parsed = fromCorrelationHeaders(toCorrelationHeaders(ctx));
    expect(parsed).toMatchObject({
      requestId: ctx.requestId,
      workspaceId: 'ws_123',
      jobId: 'job_456',
      workflowRunId: 'acme/repo#42/1',
      integrationCorrelationId: 'int_789',
    });
  });

  it('never throws on missing headers', () => {
    const ctx = fromCorrelationHeaders({});
    expect(ctx.requestId).toMatch(/^req_/);
  });

  it('reads workflow run id from CI env', () => {
    expect(
      workflowRunIdFromEnv({
        GITHUB_REPOSITORY: 'acme/repo',
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_ATTEMPT: '2',
      } as NodeJS.ProcessEnv)
    ).toBe('acme/repo#42/2');
    expect(workflowRunIdFromEnv({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
