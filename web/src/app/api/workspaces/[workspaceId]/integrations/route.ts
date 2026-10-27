/**
 * Marketplace connections list (US20 / RFC 04 task 85a).
 * GET /api/workspaces/:workspaceId/integrations (every active member)
 *
 * Membership gate first (401 / neutral 404 via `admitIntegrationMember`),
 * then `listConnections` re-checks the status-read role. Removed rows
 * (Hapus koneksi) are hidden and views never carry secrets. Shape:
 * `IntegrationConnectionListResponse` (dates serialize as ISO strings).
 * POST {provider} (Admin, task 85b): authorize URL or Blibli key form.
 * POST {provider, merchantCode, apiSellerKey, signatureKey} (Admin, task
 * 113a): first Blibli connect via `connectWithCredentials`; keys never echo.
 */
import {
  connectWithCredentials,
  integrationValidation,
  listConnections,
  startConnection,
  toConnectionView,
} from '@tokoboss/application';
import {
  IntegrationBlibliKeyFormBodySchema,
  IntegrationStartConnectionBodySchema,
} from '@tokoboss/contracts';
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
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'status');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    const connections = await listConnections(
      getIntegrationDeps(),
      admitted.ctx,
      { workspaceId: admitted.ctx.workspaceId }
    );
    return authJson({ connections }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat koneksi toko');
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const { provider, ...keys } = (
      body && typeof body === 'object' ? body : {}
    ) as Record<string, unknown>;
    const parsed = IntegrationStartConnectionBodySchema.safeParse({ provider });
    if (!parsed.success) throw integrationValidation('Permintaan tidak valid.');
    const deps = getIntegrationDeps();
    const input = { workspaceId: admitted.ctx.workspaceId, ...parsed.data };
    if (Object.keys(keys).length === 0) {
      const started = await startConnection(deps, admitted.ctx, input);
      return authJson(started, 200, ...ids, admitted.cookie);
    }
    const form = IntegrationBlibliKeyFormBodySchema.safeParse(keys);
    if (!form.success) throw integrationValidation('Permintaan tidak valid.');
    const saved = await connectWithCredentials(deps, admitted.ctx, {
      ...input,
      ...form.data,
    });
    // Task 141: run the first import inline (no crons); a failure to queue
    // never fails the save — the connection stays retryable via /import.
    const imported = await runConnectionInitialImport(
      admitted.ctx,
      { workspaceId: input.workspaceId, connectionId: saved.id },
      log
    ).catch((err: unknown) => {
      log.error('initial import start failed', {
        connectionId: saved.id,
        errorCode: 'INTEGRATION_IMPORT_START_FAILED',
        error: err instanceof Error ? err.name : 'unknown',
      });
      return null;
    });
    const connection = toConnectionView(imported?.connection ?? saved);
    return authJson({ connection }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memulai koneksi toko');
  }
}
