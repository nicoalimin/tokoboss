/**
 * Marketplace webhook intake (US20 / RFC 04 task 94c).
 * POST /api/webhooks/:provider (public; signature-gated, no session)
 *
 * Reads the raw body with `request.text()` before any parsing, then
 * `ingestWebhookEvent` verifies the signature and dedupe-persists each
 * event (persist-then-ack). Bad signature → empty 401 plus a warn log
 * (nothing stored). Otherwise each accepted event gets one durable
 * `marketplace.inbound_event` job via `enqueueInboundEventJobs` and the
 * provider gets an empty 200. Unknown or disabled provider → 404
 * PROVIDER_NOT_AVAILABLE; any other failure is a 500 so the provider
 * retries (dedupe keys make retries safe).
 *
 * Task 132 (no crons, Nico 2026-10-23): after the events are stored, the
 * 30-day inbound event purge (`purgeInboundEvents`) runs best-effort; a
 * purge error is logged and never fails the webhook.
 */
import {
  enqueueInboundEventJobs,
  ingestWebhookEvent,
  purgeInboundEvents,
} from '@tokoboss/application';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '@tokoboss/observability';
import { routeContext } from '@/lib/auth-routes';
import { integrationFailed, type RouteIds } from '@/lib/integration-access';
import { enqueueIntegrationJob, getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function emptyResponse(status: number, [requestId, correlationId]: RouteIds) {
  const headers = new Headers();
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(CORRELATION_ID_HEADER, correlationId);
  return new Response(null, { status, headers });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { provider } = await params;

  try {
    const rawBody = await request.text();
    const headers = Object.fromEntries(new Headers(request.headers).entries());
    const deps = getIntegrationDeps();
    const result = await ingestWebhookEvent(deps, provider, {
      rawBody,
      headers,
      url: request.url,
    });
    if (result.ack === 'unauthorized') {
      log.warn('webhook signature rejected', {
        route: '/api/webhooks/[provider]',
        provider,
      });
      return emptyResponse(401, ids);
    }
    await enqueueInboundEventJobs(
      { ...deps, enqueueJob: enqueueIntegrationJob },
      result.acceptedEventIds,
      correlationId
    );
    try {
      const { purged } = await purgeInboundEvents(deps);
      if (purged > 0) {
        log.info('inbound events purged', {
          route: '/api/webhooks/[provider]',
          purged,
        });
      }
    } catch (err) {
      log.error('inbound event purge failed', {
        route: '/api/webhooks/[provider]',
        provider,
        errorCode: 'INBOUND_EVENT_PURGE_FAILED',
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
    return emptyResponse(200, ids);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memproses webhook');
  }
}
