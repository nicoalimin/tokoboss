/**
 * Lanjutkan impor: retry the initial import (US20 / RFC 04 task 92c).
 * POST /api/workspaces/:workspaceId/integrations/:connectionId/import
 * (Admin only, `write` access; Manager / Staff 403 ROLE_FORBIDDEN)
 *
 * No body. `retryInitialImport` enqueues a `marketplace.initial_import`
 * job through `enqueueIntegrationJob` (idempotent key; the workflow
 * resumes from the saved cursor) and marks the connection `queued`. A
 * queued or running import is returned as-is (`alreadyQueued: true`).
 * Not connected or already complete → 400 INTEGRATION_VALIDATION.
 * Unknown, removed, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. Shape: `{ connectionId, jobId, status,
 * alreadyQueued }`; never secrets.
 */
import { connectionNotFound, retryInitialImport } from '@tokoboss/application';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { enqueueIntegrationJob, getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ workspaceId: string; connectionId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const deps = {
      ...getIntegrationDeps(),
      enqueueImport: enqueueIntegrationJob,
    };
    const result = await retryInitialImport(deps, admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
    });
    return authJson(result, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal melanjutkan impor');
  }
}
