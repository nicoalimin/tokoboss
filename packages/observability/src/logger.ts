/**
 * Structured JSON logger (UTA-12). No paid vendor required — stdout JSON.
 *
 * Every line: `{ timestamp, level, message, service, ...context, ...fields }`
 * with `fields` passed through `redact()`. Context vocabulary comes from
 * `correlation.ts`: requestId, correlationId, workspaceId (opaque),
 * jobId, workflowRunId, integrationCorrelationId, deploymentId, errorCode.
 */

import {
  type ObservabilityContext,
  resolveDeploymentId,
  resolveWorkflowRunId,
} from './correlation';
import { redact } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  service: string;
  baseContext?: ObservabilityContext;
  sink?: (line: string) => void;
}

export interface LogFields extends Record<string, unknown> {
  errorCode?: string;
}

export interface TokobossLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(extra: ObservabilityContext): TokobossLogger;
  readonly context: ObservabilityContext;
}

function defaultContext(): ObservabilityContext {
  return {
    deploymentId: resolveDeploymentId() ?? undefined,
    workflowRunId: resolveWorkflowRunId() ?? undefined,
  };
}

export function createLogger(options: LoggerOptions): TokobossLogger {
  const { service, sink } = options;
  const context: ObservabilityContext = {
    ...defaultContext(),
    ...(options.baseContext ?? {}),
  };
  const write = sink ?? ((line: string) => console.log(line));

  const emit = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const { errorCode, ...rest } = fields;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service,
      ...context,
      ...(errorCode || context.errorCode
        ? { errorCode: errorCode ?? context.errorCode }
        : {}),
      ...redact(rest),
    };
    write(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (extra: ObservabilityContext) =>
      createLogger({ service, sink, baseContext: { ...context, ...extra } }),
    context,
  };
}

/** Request-scoped child logger sharing one correlation id. */
export function requestLogger(
  parent: TokobossLogger,
  ctx: ObservabilityContext
): TokobossLogger {
  return parent.child(ctx);
}

/** Background-job child logger reusing the request's correlation id. */
export function jobLogger(
  parent: TokobossLogger,
  opts: { jobId: string; correlationId: string }
): TokobossLogger {
  return parent.child({
    jobId: opts.jobId,
    correlationId: opts.correlationId,
  });
}
