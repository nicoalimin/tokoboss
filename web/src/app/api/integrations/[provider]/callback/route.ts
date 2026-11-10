/**
 * OAuth callback (US20 / RFC 04 row 93, split 93b).
 * GET /api/integrations/:provider/callback (the provider redirects here)
 *
 * Consume the single-use state (unknown / disabled provider 404; bad,
 * expired or replayed state 410: JSON, no redirect — CoS Q2 2026-11-10),
 * admit the session as an Admin of the state's workspace, pre-check, then
 * complete the connect. Outcomes, or a redirectable error, map (93a) to a
 * 303 redirect carrying `result`; the first import runs best-effort for
 * connected shops (task 141). Tokens and partner keys are never logged.
 */
import {
  completeOAuthConnection,
  consumeOAuthCallbackState,
  precheckOAuthCallback,
  type OAuthStateRecord,
} from '@tokoboss/application';
import { NextResponse } from 'next/server';
import { routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import {
  alreadyConnectedStoreIds,
  callbackOutcomeForError,
  mapIntegrationCallback,
  type IntegrationCallbackOutcome,
} from '@/lib/integration-callback';
import { runConnectionInitialImport } from '@/lib/integration-jobs';
import { getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

const FALLBACK = 'Gagal menghubungkan toko';

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { provider } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const deps = getIntegrationDeps();

  let state: OAuthStateRecord;
  try {
    state = await consumeOAuthCallbackState(deps, {
      provider,
      state: query['state'],
    });
  } catch (err) {
    return integrationFailed(err, ids, FALLBACK);
  }
  const { workspaceId } = state;
  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);
  const { ctx, cookie } = admitted;

  let outcomes: IntegrationCallbackOutcome[];
  try {
    await precheckOAuthCallback(deps, ctx, { state, query });
    outcomes = await completeOAuthConnection(deps, ctx, { state, query });
  } catch (err) {
    const outcome = callbackOutcomeForError(err, query['shop_id'] ?? '');
    if (!outcome) return integrationFailed(err, ids, FALLBACK);
    outcomes = [outcome];
  }

  // Q4: already_connected -> this workspace's existing row (findByStore).
  const existingRowIds = new Map<string, string>();
  for (const providerStoreId of alreadyConnectedStoreIds(outcomes)) {
    const key = { workspaceId, provider: state.provider, providerStoreId };
    const row = await deps.connections.findByStore(key);
    if (row) existingRowIds.set(providerStoreId, row.id);
  }
  // The state is the target: workspace, provider, reconnect row (or null).
  const redirect = mapIntegrationCallback(state, outcomes, existingRowIds);

  // Task 141: run the first import inline (no crons); a failure to queue
  // never fails the connect — the connection stays retryable via /import.
  for (const connectionId of redirect.importConnectionIds) {
    const ref = { workspaceId, connectionId };
    await runConnectionInitialImport(ctx, ref, log).catch((err: unknown) => {
      log.error('initial import start failed', {
        connectionId,
        errorCode: 'INTEGRATION_IMPORT_START_FAILED',
        error: err instanceof Error ? err.name : 'unknown',
      });
    });
  }

  const res = NextResponse.redirect(new URL(redirect.path, request.url), 303);
  if (cookie) res.headers.set('Set-Cookie', cookie);
  return res;
}
