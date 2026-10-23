/**
 * Marketplace token Cron (US20 / RFC 04 task 95j). Every 15 minutes (row 96)
 * via GET (Vercel Cron) or POST /api/jobs/marketplace-tokens:
 * 1. refresh OAuth tokens expiring within 60 minutes, one connection at a
 *    time (single flight via the version lease in refreshConnectionTokens);
 * 2. expiry sweep: authorization expiring within 14 days → needs_reauth;
 * 3. purge raw inbound webhook events older than 30 days (CoS O9).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or a matching
 * `x-cron-secret` header. Without CRON_SECRET the route runs only outside
 * production (local dev). A failing connection is counted, not fatal.
 */
import {
  TOKEN_REFRESH_WINDOW_MS,
  purgeInboundEvents,
  refreshConnectionTokens,
  sweepConnectionExpiry,
  type RefreshOutcome,
} from '@tokoboss/application';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getIntegrationDeps } from '@/lib/integrations';

type RefreshCounts = Record<RefreshOutcome | 'failed', number>;

function cronAuthorized(request: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) {
    return (
      process.env['APP_ENV'] !== 'production' &&
      process.env['VERCEL_ENV'] !== 'production'
    );
  }
  return (
    request.headers.get('authorization') === `Bearer ${secret}` ||
    request.headers.get('x-cron-secret') === secret
  );
}

export async function GET(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  if (!cronAuthorized(request)) {
    return authJson(
      { error: 'unauthorized', errorCode: 'JOB_UNAUTHORIZED' },
      401,
      requestId,
      correlationId
    );
  }

  const deps = getIntegrationDeps();
  const before = new Date(deps.now().getTime() + TOKEN_REFRESH_WINDOW_MS);
  const due = await deps.connections.listRefreshDue(before);
  const refresh: RefreshCounts = {
    refreshed: 0,
    skipped: 0,
    needs_reauth: 0,
    retry_later: 0,
    failed: 0,
  };
  for (const row of due) {
    try {
      const outcome = await refreshConnectionTokens(deps, {
        workspaceId: row.workspaceId,
        connectionId: row.id,
      });
      refresh[outcome] += 1;
    } catch (err) {
      refresh.failed += 1;
      log.error('marketplace token refresh failed', {
        route: '/api/jobs/marketplace-tokens',
        connectionId: row.id,
        errorCode: 'MARKETPLACE_REFRESH_FAILED',
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }

  const sweep = await sweepConnectionExpiry(deps);
  const { purged } = await purgeInboundEvents(deps);
  log.info('marketplace tokens cron', {
    route: '/api/jobs/marketplace-tokens',
    due: due.length,
    refreshed: refresh.refreshed,
    skipped: refresh.skipped,
    invalidGrant: refresh.needs_reauth,
    retryLater: refresh.retry_later,
    failed: refresh.failed,
    swept: sweep.needsReauth,
    purged,
  });
  return authJson(
    { refresh: { due: due.length, ...refresh }, sweep, purged },
    200,
    requestId,
    correlationId
  );
}

export async function POST(request: Request) {
  return GET(request);
}
