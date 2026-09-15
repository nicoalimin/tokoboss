import { acceptInvite, ScryptPasswordHasher } from '@tokoboss/application';
import { AcceptInviteBodySchema } from '@tokoboss/contracts';
import {
  getAuthAudit,
  getCredentialStore,
  getMemberStore,
  storageKind,
} from '@/lib/auth';
import {
  getInviteStore,
  invitePasswordPolicy,
  membershipErrorStatus,
  toMemberView,
} from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

const hasher = new ScryptPasswordHasher();

/**
 * Accept an invite ticket (UTA-70).
 * POST /api/invites/accept (token-gated — no session required)
 *
 * Body: `{ token, userId?, newPassword? }`. The ticket binds the
 * workspace+role+scope; `userId` claims the ticket as an existing user
 * (must match the credential when one exists for the invite email), and
 * `newPassword` provisions a password credential when none exists yet
 * (omit for membership-only accept). Unknown/consumed tokens are a
 * generic 404; expired tickets are 410. Responses and logs carry opaque
 * ids only — the invitee email and the token never appear in logs.
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = AcceptInviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'TENANCY_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await acceptInvite(
      {
        invites: getInviteStore(),
        members: getMemberStore(),
        audit: getAuthAudit(),
        credentials: getCredentialStore(),
        hasher,
        passwordPolicy: invitePasswordPolicy,
      },
      {
        token: parsed.data.token,
        userId: parsed.data.userId,
        password: parsed.data.newPassword,
        correlationId,
      }
    );
    log.info('invite accepted', {
      route: '/api/invites/accept',
      memberId: result.membership.id,
    });
    return authJson(
      {
        member: toMemberView(result.membership),
        userId: result.userId,
        workspaceId: result.membership.workspaceId,
        isNewUser: result.isNewUser,
        isNewMember: result.isNewMember,
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId
    );
  } catch (err) {
    const mapped = membershipErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('invite accept failed', {
        route: '/api/invites/accept',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Accept failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Accept failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
