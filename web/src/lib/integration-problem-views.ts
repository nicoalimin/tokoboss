/**
 * Problem-variant resolver for the Integration Center (US20 / RFC 04 task
 * 102b): maps the OAuth callback `?result=` and a connection's stored
 * status to one mockup screen-4 problem variant. Keys only; the problem
 * copy lands in row 100c. No fetch, no React, no secrets.
 */
import {
  IntegrationCallbackResultSchema,
  type IntegrationCallbackResult,
  type IntegrationConnectionView,
} from '@tokoboss/contracts';

/** Mockup v2 screen 4 variants, in screen order. */
export const INTEGRATION_PROBLEM_VARIANTS = [
  'cancelled',
  'token_expired',
  'permission_missing',
  'blocked',
  'mismatch',
  'unavailable',
] as const;

export type IntegrationProblemVariant =
  (typeof INTEGRATION_PROBLEM_VARIANTS)[number];

export interface IntegrationProblem {
  variant: IntegrationProblemVariant;
  /** Provider permission names to show; only for `permission_missing`. */
  missingPermissions: string[];
}

/** Callback results that are problems on their own, without a row. */
const RESULT_VARIANT: Partial<
  Record<IntegrationCallbackResult, IntegrationProblemVariant>
> = {
  cancelled: 'cancelled',
  blocked: 'blocked',
  mismatch: 'mismatch',
  unavailable: 'unavailable',
};

/** Reads `?result=` safely; unknown, empty or repeated values → null. */
export function parseIntegrationCallbackResult(
  raw: string | string[] | null | undefined
): IntegrationCallbackResult | null {
  if (typeof raw !== 'string') return null;
  const parsed = IntegrationCallbackResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface IntegrationProblemInput {
  result?: IntegrationCallbackResult | null;
  connection?: Pick<
    IntegrationConnectionView,
    'status' | 'missingPermissions'
  > | null;
}

/**
 * The problem to show, or null when there is none (connected → success
 * screen, disconnected → Disconnected panel, nothing known → no card).
 * A problem `result` wins; otherwise the stored status decides.
 */
export function resolveIntegrationProblem(
  input: IntegrationProblemInput
): IntegrationProblem | null {
  const fromResult = input.result ? RESULT_VARIANT[input.result] : undefined;
  if (fromResult) return { variant: fromResult, missingPermissions: [] };
  const connection = input.connection;
  if (!connection || connection.status !== 'needs_reauth') return null;
  const missing = connection.missingPermissions.filter((p) => p.length > 0);
  return missing.length > 0
    ? { variant: 'permission_missing', missingPermissions: missing }
    : { variant: 'token_expired', missingPermissions: [] };
}
