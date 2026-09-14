// Structured JSON logger (UTA-12). No paid vendor required — stdout JSON lines
// that any collector (Vercel logs, `pnpm logs`, Loki, CloudWatch) can ingest.
//
// Every line carries the correlation vocabulary + deployment metadata and is
// redacted before serialization. Secrets/PII therefore never reach the sink,
// even if the caller passes them by accident.

import { getDeploymentMetadata } from '@tokoboss/config';
import type { CorrelationContext } from './correlation';
import { redactObject } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields extends Partial<CorrelationContext> {
  event?: string;
  message?: string;
  errorCode?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service: string;
  sink?: (line: string) => void;
  now?: () => string;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private readonly service: string;
  private readonly sink: (line: string) => void;
  private readonly now: () => string;
  private readonly minLevel: LogLevel;
  private readonly baseContext: Partial<CorrelationContext> & {
    deploymentId?: string;
  };

  constructor(options: LoggerOptions) {
    this.service = options.service;
    this.sink = options.sink ?? ((line) => console.log(line));
    this.now = options.now ?? (() => new Date().toISOString());
    this.minLevel =
      (process.env.LOG_LEVEL as LogLevel) in LEVEL_ORDER
        ? (process.env.LOG_LEVEL as LogLevel)
        : 'info';
    const meta = safeDeploymentMetadata();
    this.baseContext = meta.deploymentId
      ? { deploymentId: meta.deploymentId }
      : {};
  }

  /** Child logger pinned to a correlation context (request → job propagation). */
  withContext(ctx: Partial<CorrelationContext>): Logger {
    const child = new Logger({
      service: this.service,
      sink: this.sink,
      now: this.now,
    });
    Object.assign(child.baseContext, this.baseContext, ctx);
    return child;
  }

  debug(fields: LogFields): void {
    this.emit('debug', fields);
  }

  info(fields: LogFields): void {
    this.emit('info', fields);
  }

  warn(fields: LogFields): void {
    this.emit('warn', fields);
  }

  error(fields: LogFields & { error?: unknown }): void {
    const { error, ...rest } = fields;
    this.emit('error', {
      ...rest,
      error: error instanceof Error ? safeError(error) : error,
    });
  }

  /** Time a background execution; logs start/done with the same correlation. */
  async runJob<T>(
    ctx: CorrelationContext,
    jobId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const jobCtx = { ...ctx, jobId };
    const startedAt = Date.now();
    this.info({
      ...jobCtx,
      event: 'job.start',
      message: `job ${jobId} started`,
    });
    try {
      const result = await fn();
      this.info({
        ...jobCtx,
        event: 'job.done',
        message: `job ${jobId} completed`,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.error({
        ...jobCtx,
        event: 'job.failed',
        message: `job ${jobId} failed`,
        durationMs: Date.now() - startedAt,
        errorCode: ctx.errorCode ?? 'job_failed',
        error,
      });
      throw error;
    }
  }

  private emit(level: LogLevel, fields: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const payload = redactObject({
      timestamp: this.now(),
      level,
      service: this.service,
      ...this.baseContext,
      ...fields,
    });
    this.sink(JSON.stringify(payload));
  }
}

function safeDeploymentMetadata(): { deploymentId?: string } {
  try {
    const meta = getDeploymentMetadata();
    return {
      deploymentId:
        meta.deploymentId ?? meta.commitSha?.slice(0, 12) ?? undefined,
    };
  } catch {
    return {};
  }
}

function safeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack
      ? { stack: error.stack.split('\n').slice(0, 5).join('\n') }
      : {}),
  };
}

/** Default process logger (service name overridable via SERVICE_NAME). */
export function createLogger(
  service = process.env.SERVICE_NAME ?? 'tokoboss',
  options: Partial<LoggerOptions> = {}
): Logger {
  return new Logger({ service, ...options });
}
