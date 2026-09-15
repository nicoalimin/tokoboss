import { getWorkspaceStore, storageKind } from '@/lib/auth';
import { hasValidBootstrapPassword } from '@/lib/bootstrap-auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Lists every workspace for server-side management. Disabled unless the
 * caller presents the server-only bootstrap password.
 */
export async function GET(request: Request) {
  const { requestId, correlationId } = routeContext(request);
  if (!hasValidBootstrapPassword(request)) {
    return authJson(
      { error: 'Not found.', errorCode: 'NOT_FOUND' },
      404,
      requestId,
      correlationId
    );
  }

  const workspaces = await getWorkspaceStore().listWorkspaces();

  return authJson(
    { workspaces, storage: storageKind() },
    200,
    requestId,
    correlationId,
    undefined
  );
}
