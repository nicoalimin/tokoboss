/**
 * Marketplace reauthorize / reconnect (US20 / RFC 04 task 87).
 * POST /api/workspaces/:workspaceId/integrations/:connectionId/reauthorize
 * (Admin only, `write` access)
 *
 * Empty body: restart the connect flow for this row via `startConnection`
 * with `connectionId` (Shopee / TikTok Shop → new OAuth state + authorize
 * URL; Blibli → `credential_binding`, the UI shows the key form).
 * Blibli key form body: key re-entry via `connectWithCredentials` (same
 * merchant code or 409 REAUTH_STORE_MISMATCH); keys are never echoed.
 * Unknown, removed, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. Responses never carry secrets.
 */
import {
  connectionNotFound,
  connectWithCredentials,
  getConnection,
  integrationValidation,
  startConnection,
  toConnectionView,
} from '@tokoboss/application';
import { IntegrationBlibliKeyFormBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { runConnectionInitialImport } from '@/lib/integration-jobs';
import { getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ workspaceId: string; connectionId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isEmptyBody(body: unknown): boolean {
  if (body === null || body === undefined) return true;
  return (
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const deps = getIntegrationDeps();
    const target = { workspaceId: admitted.ctx.workspaceId, connectionId };
    const row = await getConnection(deps, admitted.ctx, target);
    const body: unknown = await request.json().catch(() => null);

    if (isEmptyBody(body)) {
      const started = await startConnection(deps, admitted.ctx, {
        ...target,
        provider: row.provider,
      });
      return authJson(started, 200, ...ids, admitted.cookie);
    }

    const parsed = IntegrationBlibliKeyFormBodySchema.safeParse(body);
    if (!parsed.success) throw integrationValidation('Permintaan tidak valid.');
    const saved = await connectWithCredentials(deps, admitted.ctx, {
      ...target,
      provider: row.provider,
      ...parsed.data,
    });
    // Task 142: an unfinished first import runs inline (no crons); a failure
    // to queue never fails the reauthorize (still retryable via /import).
    const imported =
      saved.initialImportStatus === 'complete'
        ? null
        : await runConnectionInitialImport(admitted.ctx, target, log).catch(
            (err: unknown) => {
              log.error('initial import start failed', {
                connectionId,
                errorCode: 'INTEGRATION_IMPORT_START_FAILED',
                error: err instanceof Error ? err.name : 'unknown',
              });
              return null;
            }
          );
    const connection = toConnectionView(imported?.connection ?? saved);
    return authJson({ connection }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal mengotorisasi ulang koneksi');
  }
}
