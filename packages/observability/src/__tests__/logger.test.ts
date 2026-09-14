import { describe, expect, it } from 'vitest';
import { createLogger } from '../logger.js';
import { REDACTED } from '../redact.js';

describe('logger', () => {
  it('emits redacted JSON with correlation vocabulary', () => {
    const lines: string[] = [];
    const log = createLogger({
      service: 'web',
      baseContext: {
        requestId: 'req_1',
        correlationId: 'corr_1',
        workspaceId: 'ws_123',
        jobId: 'job_1',
        workflowRunId: '42',
        integrationCorrelationId: 'int_9',
        deploymentId: 'dpl_7',
      },
      sink: (l) => lines.push(l),
    });
    log.info('order synced', {
      email: 'buyer@example.com',
      orderId: 'ORD-1',
    });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] as string);
    expect(entry.service).toBe('web');
    expect(entry.requestId).toBe('req_1');
    expect(entry.correlationId).toBe('corr_1');
    expect(entry.workspaceId).toBe('ws_123');
    expect(entry.jobId).toBe('job_1');
    expect(entry.workflowRunId).toBe('42');
    expect(entry.integrationCorrelationId).toBe('int_9');
    expect(entry.deploymentId).toBe('dpl_7');
    expect(entry.email).toBe(REDACTED);
    expect(entry.orderId).toBe('ORD-1');
  });

  it('child logger inherits and overrides context; error carries errorCode', () => {
    const lines: string[] = [];
    const parent = createLogger({
      service: 'worker',
      baseContext: { correlationId: 'corr_x' },
      sink: (l) => lines.push(l),
    });
    const child = parent.child({ jobId: 'job_9' });
    child.error('job failed', {
      errorCode: 'DB_UNREACHABLE',
      detail: 'timeout',
    });
    const entry = JSON.parse(lines[0] as string);
    expect(entry.correlationId).toBe('corr_x');
    expect(entry.jobId).toBe('job_9');
    expect(entry.errorCode).toBe('DB_UNREACHABLE');
  });
});
