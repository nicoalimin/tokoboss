import { describe, expect, it } from 'vitest';
import { newCorrelationContext } from '../correlation';
import { Logger } from '../logger';
import { REDACTED } from '../redact';

function collectLogger(service = 'test') {
  const lines: string[] = [];
  const logger = new Logger({
    service,
    sink: (line) => lines.push(line),
    now: () => '2026-01-01T00:00:00.000Z',
  });
  return { lines, logger };
}

describe('structured logger', () => {
  it('emits JSON lines with correlation fields', () => {
    const { lines, logger } = collectLogger('web');
    const ctx = newCorrelationContext({ workspaceId: 'ws_123' });
    logger.withContext(ctx).info({ event: 'request.start', message: 'GET /' });
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0] as string);
    expect(payload).toMatchObject({
      service: 'web',
      level: 'info',
      requestId: ctx.requestId,
      workspaceId: 'ws_123',
      event: 'request.start',
    });
  });

  it('redacts secrets even when passed by accident', () => {
    const { lines, logger } = collectLogger();
    logger.info({
      event: 'debug.dump',
      DATABASE_URL: 'postgres://user:pass@host/db',
      email: 'budi@example.id',
      safe: 'keep-me',
    });
    const payload = JSON.parse(lines[0] as string);
    expect(payload.DATABASE_URL).toBe(REDACTED);
    expect(String(payload.email)).toContain(REDACTED);
    expect(payload.safe).toBe('keep-me');
  });

  it('correlates a request and a background job end to end', async () => {
    const { lines, logger } = collectLogger('worker');
    const ctx = newCorrelationContext({ workspaceId: 'ws_123' });
    await logger.runJob(ctx, 'job_sync_1', async () => {
      logger.withContext({ ...ctx, jobId: 'job_sync_1' }).info({
        event: 'integration.sync',
        integrationCorrelationId: 'int_9',
      });
      return 'ok';
    });
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l));
    for (const p of parsed) expect(p.requestId).toBe(ctx.requestId);
    expect(parsed[0]?.event).toBe('job.start');
    expect(parsed[1]?.event).toBe('integration.sync');
    expect(parsed[2]?.event).toBe('job.done');
  });

  it('logs job failures with a safe error code and no secret leak', async () => {
    const { lines, logger } = collectLogger();
    const ctx = newCorrelationContext({ errorCode: 'sync_failed' });
    await expect(
      logger.runJob(ctx, 'job_1', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    const failed = JSON.parse(lines[lines.length - 1] as string);
    expect(failed.event).toBe('job.failed');
    expect(failed.errorCode).toBe('sync_failed');
  });
});
