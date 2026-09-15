import {
  createInvite,
  listInvites,
} from '@tokoboss/application';
import { CreateInviteBodySchema } from '@tokoboss/contracts';
import { getAuthAudit, getCredentialStore, getMemberStore, storageKind } from '@/lib/auth';
import {
  getInviteStore,
  membershipErrorStatus,
  requireWorkspaceAdmin,
  slideForAdmin,
} from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Create an invite ticket (UTA-70).
 * POST /api/workspaces/:workspaceId/invites (Admin-only)
 *
 * Body: `{ email, role: "admin"|"manager"|"staff", warehouseScope?,
 * ttlMs? }`. Managers/Staff may carry one warehouse scope; Admin must be
 * unscoped (enforced server-side). Returns the invite view plus the opaque
 * bearer `token` ONCE (hash-only at rest) — the Admin delivers it to the
 * invitee out of band (email provider polish is out of scope).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId } = await params;

  const admin = await requireWorkspaceAdmin(request, workspaceId);
  if (!admin.ok) {
    return authJson(
      { error: admin.denial.error, errorCode: admin.denial.errorCode },
      admin.denial.status,
      requestId,
      correlationId
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = CreateInviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'TENANCY_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await createInvite(
      getInviteStore(),
      getMemberStore(),
      {
        ctx: admin.value.ctx,
        workspaceId: admin.value.ctx.workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        warehouseScope: parsed.data.warehouseScope ?? null,
        ttlMs: parsed.data.ttlMs,
        correlationId,
      },
      getAuthAudit(),
      getCredentialStore()
    );
    // Log references only — never the token or the invitee email.
    log.info('invite created', {
      route: '/api/workspaces/[workspaceId]/invites',
      inviteId: result.invite.id,
    });
    return authJson(
      { invite: result.invite, token: result.token, storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForAdmin(admin.value)
    );
  } catch (err) {
    const mapped = membershipErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('invite create failed', {
        route: '/api/workspaces/[workspaceId]/invites',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Invite failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Invite failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * List invite tickets (UTA-70).
 * GET /api/workspaces/:workspaceId/invites (Admin-only)
 *
 * Views include the invitee email so Admins can triage tickets; the list
 * never exposes token hashes or raw tokens.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId } = await params;

  const admin = await requireWorkspaceAdmin(request, workspaceId);
  if (!admin.ok) {
    return authJson(
      { error: admin.denial.error, errorCode: admin.denial.errorCode },
      admin.denial.status,
      requestId,
      correlationId
    );
  }
  const invites = await listInvites(getInviteStore(), {
    ctx: admin.value.ctx,
    workspaceId: admin.value.ctx.workspaceId,
  });
  return authJson(
    { invites, storage: storageKind() },
    200,
    requestId,
    correlationId,
    slideForAdmin(admin.value)
  );
}
